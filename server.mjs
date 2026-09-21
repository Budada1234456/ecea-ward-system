import express from "express";
import multer from "multer";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createWorker } from "tesseract.js";
import chiSimData from "@tesseract.js-data/chi_sim";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { extractProjectSourceFields } from "./lib/pdf-fields.mjs";
import { mergePreviewPdfParts, renderPreviewPdf } from "./lib/pdf-export.mjs";
import { createWordImportRouter } from "./routes/word-import.mjs";
import { sanitizeApplicationRichTextData } from "./src/editor/rich-text-node.mjs";
import { validateApplication } from "./src/forms/application-validation.js";
import {
  PDF_EXPORT_SINGLE_PAGE_LIMIT,
  PDF_EXPORT_TOTAL_HTML_LIMIT,
} from "./src/pdf-export-parts.js";
import {
  AWARD_TYPES,
  awardProfiles,
  getAwardProfile,
  getSubmissionRequirements,
} from "./src/award-profiles.js";

const execFileAsync = promisify(execFile);
const app = express();
app.set("trust proxy", "loopback");
const portArgument = process.argv.find((argument) =>
  argument.startsWith("--port="),
);
const hostArgument = process.argv.find((argument) =>
  argument.startsWith("--host="),
);
const port = Number(portArgument?.slice(7) || process.env.PORT || 4174);
const host = hostArgument?.slice(7) || process.env.HOST || "127.0.0.1";
const serverSourcePath = fileURLToPath(import.meta.url);
const backendStartedAt = new Date();
const root = path.dirname(serverSourcePath);
const dataDir = path.join(root, "data");
const allowInsecurePasswordReset =
  process.env.ALLOW_INSECURE_PASSWORD_RESET === "true";
fs.mkdirSync(path.join(dataDir, "files"), { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "award-system.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    award_type TEXT NOT NULL,
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    progress INTEGER NOT NULL DEFAULT 0,
    data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS application_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    stored_path TEXT,
    extraction_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_applications_year ON applications(year);
  CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
  CREATE INDEX IF NOT EXISTS idx_files_application ON application_files(application_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
`);

const fileColumns = db.prepare("PRAGMA table_info('application_files')").all();
if (!fileColumns.some((column) => column.name === "stored_path")) {
  db.exec("ALTER TABLE application_files ADD COLUMN stored_path TEXT");
}
if (!fileColumns.some((column) => column.name === "page_count")) {
  db.exec(
    "ALTER TABLE application_files ADD COLUMN page_count INTEGER NOT NULL DEFAULT 1",
  );
}
if (!fileColumns.some((column) => column.name === "mime_type")) {
  db.exec("ALTER TABLE application_files ADD COLUMN mime_type TEXT");
}
const applicationColumns = db
  .prepare("PRAGMA table_info('applications')")
  .all();
if (!applicationColumns.some((column) => column.name === "owner_id")) {
  db.exec(
    "ALTER TABLE applications ADD COLUMN owner_id INTEGER REFERENCES users(id)",
  );
}

const findUserByAccountStatement = db.prepare(
  "SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE",
);

function findUserByAccount(account) {
  return findUserByAccountStatement.get(account, account);
}

const upload = multer({
  dest: path.join(os.tmpdir(), "ceca-award-imports"),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(allowed ? null : new Error("仅支持 PDF 文件"), allowed);
  },
});

const materialUpload = multer({
  dest: path.join(os.tmpdir(), "ceca-award-materials"),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"].includes(
      extension,
    );
    cb(
      allowed ? null : new Error("附件仅支持 PDF、JPG、PNG、DOC、DOCX"),
      allowed,
    );
  },
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const authAttempts = new Map();
const extractionJobs = new Map();
const extractionQueue = [];
const pdfUploads = new Map();
const extractionJobRetentionMs = 30 * 60_000;
const pdfUploadRetentionMs = 60 * 60_000;
const pdfChunkSize = 5 * 1024 * 1024;
const maxPdfSize = 100 * 1024 * 1024;
const maxActivePdfUploads = 20;
const maxActivePdfUploadsPerUser = 3;
const maxActivePdfUploadBytes = 1024 * 1024 * 1024;
const maxActivePdfUploadBytesPerUser = 300 * 1024 * 1024;
const maxPendingExtractions = 10;
const maxPendingExtractionsPerUser = 2;
const pdfCommandTimeoutMs = positiveInteger(
  process.env.PDF_COMMAND_TIMEOUT_MS,
  120_000,
);
const authWindowMs = positiveInteger(
  process.env.AUTH_RATE_WINDOW_MS,
  15 * 60_000,
);
const authMaxAttempts = positiveInteger(process.env.AUTH_RATE_MAX, 30);
const authMaxClients = positiveInteger(
  process.env.AUTH_RATE_MAX_CLIENTS,
  10_000,
);
const extractionConcurrency = positiveInteger(
  process.env.PDF_EXTRACTION_CONCURRENCY,
  1,
);
let activeExtractions = 0;
const sectionPreviewJobs = new Map();

async function cleanupStaleTemporaryFiles() {
  const expiration = Date.now() - pdfUploadRetentionMs;
  const temporaryRoot = os.tmpdir();
  const entries = await fsPromises.readdir(temporaryRoot, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (
      !entry.name.startsWith("ceca-award-upload-") &&
      entry.name !== "ceca-award-imports"
    )
      continue;
    const target = path.join(temporaryRoot, entry.name);
    if (entry.name === "ceca-award-imports") {
      for (const file of await fsPromises.readdir(target).catch(() => [])) {
        const filePath = path.join(target, file);
        const stats = await fsPromises.stat(filePath).catch(() => null);
        if (stats && stats.mtimeMs < expiration)
          await fsPromises.rm(filePath, { recursive: true, force: true });
      }
      continue;
    }
    const stats = await fsPromises.stat(target).catch(() => null);
    if (stats && stats.mtimeMs < expiration)
      await fsPromises.rm(target, { recursive: true, force: true });
  }
}

void cleanupStaleTemporaryFiles().catch((error) => {
  console.warn(`临时文件清理失败：${error.message}`);
});

function pruneExpiredAuthAttempts(timestamp) {
  for (const [key, entry] of authAttempts) {
    if (entry.resetAt <= timestamp) authAttempts.delete(key);
  }
}

function authRateLimit(req, res, next) {
  const timestamp = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= timestamp) {
    if (!entry && authAttempts.size >= authMaxClients) {
      pruneExpiredAuthAttempts(timestamp);
      if (authAttempts.size >= authMaxClients)
        return res
          .status(429)
          .json({ ok: false, message: "服务繁忙，请稍后再试" });
    }
    entry = { count: 0, resetAt: timestamp + authWindowMs };
  }
  entry.count += 1;
  authAttempts.set(key, entry);
  const resetAfterSeconds = Math.max(
    1,
    Math.ceil((entry.resetAt - timestamp) / 1000),
  );
  res.setHeader("RateLimit-Limit", String(authMaxAttempts));
  res.setHeader(
    "RateLimit-Remaining",
    String(Math.max(0, authMaxAttempts - entry.count)),
  );
  res.setHeader("RateLimit-Reset", String(resetAfterSeconds));
  if (entry.count > authMaxAttempts) {
    res.setHeader("Retry-After", String(resetAfterSeconds));
    return res
      .status(429)
      .json({ ok: false, message: "操作过于频繁，请稍后再试" });
  }
  next();
}

app.use("/api/auth", (req, res, next) =>
  req.method === "POST" ? authRateLimit(req, res, next) : next(),
);
app.use(
  express.json({
    limit: "15mb",
    type: (req) =>
      req.path !== "/api/pdf-export" && Boolean(req.is("application/json")),
  }),
);

const now = () => new Date().toISOString();
const hashToken = (value) => createHash("sha256").update(value).digest("hex");

async function persistUploadedFile(sourcePath, destinationPath) {
  try {
    await fsPromises.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
  }

  const temporaryPath = `${destinationPath}.${randomBytes(6).toString("hex")}.uploading`;
  try {
    await fsPromises.copyFile(
      sourcePath,
      temporaryPath,
      fs.constants.COPYFILE_EXCL,
    );
    await fsPromises.rename(temporaryPath, destinationPath);
    await fsPromises.unlink(sourcePath).catch(() => {});
  } catch (error) {
    await fsPromises.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, expectedHex] = String(stored || "").split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]),
  );
}

function publicUser(row) {
  return row
    ? {
        id: row.id,
        username: row.username,
        email: row.email,
        displayName: row.display_name,
      }
    : null;
}

function sessionCookieOptions(req) {
  return { httpOnly: true, sameSite: "lax", path: "/", secure: req.secure };
}

function createSession(req, res, userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 14 * 86400_000);
  db.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(userId, hashToken(token), expiresAt.toISOString(), now());
  res.cookie("award_session", token, {
    ...sessionCookieOptions(req),
    maxAge: 14 * 86400_000,
  });
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie).award_session;
  if (!token) return null;
  return db
    .prepare(
      `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(hashToken(token), now());
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ ok: false, message: "请先登录" });
  req.user = user;
  next();
}

function ownedApplication(id, userId, includeArchived = false) {
  return db
    .prepare(
      `SELECT * FROM applications WHERE id = ? AND owner_id = ?${includeArchived ? "" : " AND archived_at IS NULL"}`,
    )
    .get(id, userId);
}

const extractionJobCleanup = setInterval(() => {
  const expiration = Date.now() - extractionJobRetentionMs;
  for (const [jobId, job] of extractionJobs) {
    if (job.finishedAt && job.finishedAt < expiration)
      extractionJobs.delete(jobId);
  }
  const uploadExpiration = Date.now() - pdfUploadRetentionMs;
  for (const [uploadId, upload] of pdfUploads) {
    if (
      upload.status !== "assembling" &&
      upload.lastActivityAt < uploadExpiration
    ) {
      pdfUploads.delete(uploadId);
      void fsPromises.rm(upload.directory, { recursive: true, force: true });
    }
  }
}, 5 * 60_000);
extractionJobCleanup.unref();

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  res.json({ ok: true, user: publicUser(user), registrationOpen: true });
});

app.post("/api/auth/register", (req, res) => {
  const username = String(req.body.username || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const displayName = String(req.body.displayName || username).trim();
  const password = String(req.body.password || "");
  if (!/^[A-Za-z0-9_\u3400-\u9fff]{3,32}$/u.test(username))
    return res
      .status(422)
      .json({ ok: false, message: "账号需为 3-32 位中文、字母、数字或下划线" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(422).json({ ok: false, message: "请填写有效邮箱" });
  if (password.length < 8)
    return res.status(422).json({ ok: false, message: "密码至少 8 位" });
  try {
    const timestamp = now();
    const result = db
      .prepare(
        `INSERT INTO users (username, email, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        username,
        email,
        displayName || username,
        hashPassword(password),
        timestamp,
        timestamp,
      );
    const userId = Number(result.lastInsertRowid);
    // The first account adopts projects created by earlier local-only versions.
    if (db.prepare("SELECT COUNT(*) AS total FROM users").get().total === 1)
      db.prepare(
        "UPDATE applications SET owner_id = ? WHERE owner_id IS NULL",
      ).run(userId);
    createSession(req, res, userId);
    res.status(201).json({
      ok: true,
      user: publicUser(
        db.prepare("SELECT * FROM users WHERE id = ?").get(userId),
      ),
    });
  } catch (error) {
    if (String(error.message).includes("UNIQUE"))
      return res.status(409).json({ ok: false, message: "账号或邮箱已被注册" });
    throw error;
  }
});

app.post("/api/auth/login", (req, res) => {
  const account = String(req.body.account || "").trim();
  const user = findUserByAccount(account);
  if (
    !user ||
    !verifyPassword(String(req.body.password || ""), user.password_hash)
  )
    return res.status(401).json({ ok: false, message: "账号或密码错误" });
  createSession(req, res, user.id);
  res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie).award_session;
  if (token)
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
      hashToken(token),
    );
  res.clearCookie("award_session", sessionCookieOptions(req));
  res.json({ ok: true });
});

app.post("/api/auth/forgot-password", (req, res) => {
  if (!allowInsecurePasswordReset) {
    return res.json({
      ok: true,
      resetAvailable: false,
      message: "在线密码重置尚未配置，请联系系统管理员处理",
    });
  }
  const account = String(req.body.account || "").trim();
  const user = findUserByAccount(account);
  if (!user)
    return res.json({
      ok: true,
      resetAvailable: true,
      message: "如账号存在，重置码已生成",
    });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare(
    "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
  ).run(now(), user.id);
  db.prepare(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(
    user.id,
    hashToken(code),
    new Date(Date.now() + 15 * 60_000).toISOString(),
    now(),
  );
  res.json({
    ok: true,
    resetAvailable: true,
    message: "重置码 15 分钟内有效",
    developmentCode: code,
  });
});

app.post("/api/auth/reset-password", (req, res) => {
  const account = String(req.body.account || "").trim();
  const code = String(req.body.code || "").trim();
  const password = String(req.body.password || "");
  if (password.length < 8)
    return res.status(422).json({ ok: false, message: "新密码至少 8 位" });
  const user = findUserByAccount(account);
  const token =
    user &&
    db
      .prepare(
        "SELECT * FROM password_reset_tokens WHERE user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1",
      )
      .get(user.id, hashToken(code), now());
  if (!token)
    return res.status(422).json({ ok: false, message: "重置码无效或已过期" });
  const timestamp = now();
  db.prepare(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
  ).run(hashPassword(password), timestamp, user.id);
  db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(
    timestamp,
    token.id,
  );
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  res.json({ ok: true, message: "密码已重置，请重新登录" });
});

app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path.startsWith("/auth/")) return next();
  return requireAuth(req, res, next);
});

app.use(
  "/api/word-import",
  createWordImportRouter({
    ownsApplication: (applicationId, userId) =>
      Boolean(ownedApplication(applicationId, userId)),
  }),
);

app.use("/api/pdf-export", express.json({ limit: "100mb" }));

app.post("/api/pdf-export", async (req, res) => {
  const html = String(req.body?.html || "");
  const applicationId = Number(req.body?.applicationId);
  const requestedParts = Array.isArray(req.body?.parts) ? req.body.parts : null;
  const styles = String(req.body?.styles || "");
  const fileName = String(req.body?.fileName || "申报书.pdf")
    .replace(/[\r\n<>:"/\\|?*\x00-\x1f]/g, "_")
    .slice(0, 180);
  const totalHtmlLength = requestedParts
    ? requestedParts.reduce(
        (total, part) =>
          total + (part?.type === "html" ? String(part.html || "").length : 0),
        0,
      )
    : html.length;
  if (
    (!requestedParts?.length && !html) ||
    requestedParts?.length > 200 ||
    totalHtmlLength > PDF_EXPORT_TOTAL_HTML_LIMIT
  ) {
    return res
      .status(422)
      .json({ ok: false, message: "PDF 导出内容为空或过大" });
  }
  if (
    requestedParts?.some(
      (part) =>
        part?.type === "html" &&
        String(part.html || "").length > PDF_EXPORT_SINGLE_PAGE_LIMIT,
    )
  ) {
    return res.status(422).json({
      ok: false,
      message: "PDF 导出单个页面分段过大，请压缩图片后重试",
    });
  }
  let parts = requestedParts;
  if (parts) {
    if (
      !Number.isInteger(applicationId) ||
      !ownedApplication(applicationId, req.user.id)
    ) {
      return res.status(404).json({ ok: false, message: "申报项目不存在" });
    }
    const pdfFiles = new Map();
    let sourcePdfBytes = 0;
    for (const part of parts.filter((candidate) => candidate?.type === "pdf")) {
      const fileId = Number(part.fileId);
      if (pdfFiles.has(fileId)) {
        return res.status(422).json({ ok: false, message: "PDF 导出分段重复" });
      }
      const row = db
        .prepare(
          "SELECT * FROM application_files WHERE id = ? AND application_id = ?",
        )
        .get(fileId, applicationId);
      if (
        !row?.stored_path ||
        !fs.existsSync(row.stored_path) ||
        path.extname(row.file_name).toLowerCase() !== ".pdf"
      ) {
        return res.status(422).json({
          ok: false,
          message: "PDF 导出包含无效或无权访问的原始文件",
        });
      }
      sourcePdfBytes += Number(row.file_size || 0);
      if (sourcePdfBytes > 300 * 1024 * 1024) {
        return res.status(422).json({
          ok: false,
          message: "PDF 导出文件总大小超过 300MB",
        });
      }
      pdfFiles.set(fileId, row.stored_path);
    }
    parts = parts.map((part) => {
      if (part?.type === "html" && String(part.html || "")) {
        return { type: "html", html: String(part.html) };
      }
      const fileId = Number(part?.fileId);
      if (part?.type === "pdf" && pdfFiles.has(fileId)) {
        return { type: "pdf", path: pdfFiles.get(fileId) };
      }
      return null;
    });
    if (parts.some((part) => !part)) {
      return res.status(422).json({ ok: false, message: "PDF 导出分段无效" });
    }
  } else {
    parts = [{ type: "html", html }];
  }
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol;
  const requestOrigin = req.get("origin");
  const serverOrigin = `${protocol}://${req.get("host")}`;
  let baseUrl;
  try {
    const serverUrl = new URL(serverOrigin);
    const candidate = new URL(requestOrigin || serverOrigin);
    baseUrl = serverUrl.origin;
    if (
      ["http:", "https:"].includes(candidate.protocol) &&
      candidate.hostname === serverUrl.hostname
    ) {
      baseUrl = candidate.origin;
    }
  } catch {
    return res.status(400).json({ ok: false, message: "PDF 导出地址无效" });
  }
  try {
    const sessionToken = parseCookies(req.headers.cookie).award_session;
    const renderedParts = [];
    for (const part of parts) {
      if (part.type === "pdf") {
        renderedParts.push({
          pdf: await fsPromises.readFile(part.path),
          addPageNumbers: true,
        });
        continue;
      }
      renderedParts.push({
        pdf: await renderPreviewPdf({
          html: part.html,
          styles,
          baseUrl,
          sessionToken,
        }),
        addPageNumbers: false,
      });
    }
    const pdf = await mergePreviewPdfParts(renderedParts);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`)}`,
    );
    const buffer = Buffer.from(pdf);
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (error) {
    console.error("PDF export failed", error);
    res.status(500).json({
      ok: false,
      message: `PDF 生成失败：${error.message || "服务器内部错误"}`,
    });
  }
});

function parseData(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function applicationFromRow(row) {
  if (!row) return null;
  const { data_json: dataJson, ...meta } = row;
  return { ...meta, data: parseData(dataJson) };
}

function calculateProgress(data) {
  const profile = getAwardProfile(data?.awardType);
  if (profile.code === "achievement") {
    const requirements = getSubmissionRequirements(profile.value);
    const complete = requirements.filter(({ key }) =>
      hasApplicationValue(data, key),
    ).length;
    return Math.min(100, Math.round((complete / requirements.length) * 100));
  }
  const keys = [
    "year",
    "awardType",
    "projectName",
    "projectNameEn",
    "applicantUnit",
    "contact",
    "phone",
    "email",
    "industry",
    "startDate",
    "endDate",
    "introduction",
  ];
  let complete = keys.filter((key) => String(data?.[key] || "").trim()).length;
  if (Array.isArray(data?.people) && data.people.length) complete += 1;
  if (Array.isArray(data?.units) && data.units.length) complete += 1;
  if (Array.isArray(data?.disciplines) && data.disciplines.some(Boolean))
    complete += 1;
  return Math.min(100, Math.round((complete / 15) * 100));
}

function applicationValue(data, key) {
  return key.split(".").reduce((value, part) => value?.[part], data);
}

function applicationPlainText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#160);/gi, "")
    .trim();
}

function hasApplicationValue(data, key) {
  const value = applicationValue(data, key);
  if (Array.isArray(value)) {
    if (key === "people" || key === "units") {
      return value.some(
        (record) =>
          applicationPlainText(
            typeof record === "string" ? record : record?.name,
          ).length > 0 &&
          applicationPlainText(
            typeof record === "string" ? "" : record?.contribution,
          ).length > 0,
      );
    }
    return value.length > 0;
  }
  const source = String(value || "");
  if (/<img\b[^>]*>/i.test(source)) return true;
  return applicationPlainText(source).length > 0;
}

function parseApplicationDate(value, boundary) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const day = match[3]
    ? Number(match[3])
    : boundary === "end"
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

function hasMinimumApplicationDuration(records, years, applicationYear) {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const yearEnd = new Date(Date.UTC(applicationYear, 11, 31));
  if (Number.isNaN(yearEnd.getTime())) return false;
  const referenceDate = today < yearEnd ? today : yearEnd;
  return (records || []).some((record) => {
    const start = parseApplicationDate(record?.startDate, "start");
    const endValue = String(record?.endDate || "").trim();
    const declaredEnd = endValue
      ? parseApplicationDate(endValue, "end")
      : referenceDate;
    if (!start || !declaredEnd || start > referenceDate) return false;
    const end = declaredEnd < referenceDate ? declaredEnd : referenceDate;
    if (end < start) return false;
    const minimumEnd = new Date(start);
    minimumEnd.setUTCFullYear(minimumEnd.getUTCFullYear() + years);
    return end >= minimumEnd;
  });
}

function writeAudit(applicationId, action, detail = "") {
  db.prepare(
    "INSERT INTO audit_logs (application_id, action, detail, created_at) VALUES (?, ?, ?, ?)",
  ).run(applicationId || null, action, detail, now());
}

function compact(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function between(text, start, end) {
  const startIndex = text.search(start);
  if (startIndex < 0) return "";
  const remainder = text.slice(startIndex).replace(start, "");
  const endIndex = remainder.search(end);
  return compact(endIndex < 0 ? remainder : remainder.slice(0, endIndex));
}

function normalizeUploadedName(originalName) {
  const name = String(originalName || "");
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("\ufffd") ? name : decoded;
  } catch {
    return name;
  }
}

function titleFromFilename(originalName) {
  const base = path.basename(originalName, path.extname(originalName));
  const marker = base.match(/申报书[-—_ ](.+)$/u);
  return (marker?.[1] || "").replace(/[-—_ ]?（?盖章版）?$/, "").trim();
}

function titleFromText(text) {
  const frontMatter = text.slice(0, 30000);
  const match = frontMatter.match(
    /项\s*目\s*名\s*称\s*[（(]?\s*中\s*文\s*[）)]?\s*[：:]?\s*([^\n]{4,100})/u,
  );
  return match?.[1]
    ?.replace(/\s{2,}.+$/, "")
    .replace(/^[：:\s]+|[：:\s]+$/g, "")
    .trim();
}

function cleanSection(value, maxLength = 12000) {
  const lines = String(value || "")
    .replace(/\r|\f/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .filter((line) => !/^\s*\d{1,3}\s*$/.test(line));
  const paragraphs = [];
  let paragraph = "";
  const flush = () => {
    if (paragraph.trim()) paragraphs.push(paragraph.trim());
    paragraph = "";
  };
  const structural = (line) =>
    /^(?:[一二三四五六七八九十]+[、.．]|[（(]?\d+[）).、．]|[①②③④⑤⑥⑦⑧⑨⑩]|图\s*\d+|表\s*\d+)/.test(
      line.trim(),
    );
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (structural(line)) flush();
    if (!paragraph) {
      paragraph = line;
    } else if (/[-‐‑]$/.test(paragraph) && /^[A-Za-z]/.test(line)) {
      paragraph = paragraph.slice(0, -1) + line;
    } else {
      const needsSpace =
        /[A-Za-z0-9,.;:)]$/.test(paragraph) && /^[A-Za-z0-9(]/.test(line);
      paragraph += needsSpace ? ` ${line}` : line;
    }
    if (structural(line)) flush();
  }
  flush();
  return paragraphs
    .join("\n\n")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}

function firstMatch(text, patterns, maxLength = 300) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]
      ?.replace(/\s{2,}.+$/, "")
      .replace(/^[：:\s]+|[：:\s]+$/g, "")
      .trim();
    if (value) return cleanSection(value, maxLength).replace(/\n+/g, " ");
  }
  return "";
}

function extractBasicFields(text) {
  const front = text.slice(0, 80000);
  const projectNameEn = firstMatch(
    front,
    [
      /(?:项目名称[^\n]{0,30})?英\s*文\s*[：:]?\s*\n?\s*([A-Za-z][A-Za-z0-9 ,.'()&/\-–—:\n]{5,300}?)(?=\n\s*(?:主要完成人|主要完成单位|第一申报单位|联系人|中\s*文)|\n{2,})/u,
      /(?:Project\s*(?:Name|Title))\s*[：:]?\s*([^\n]{5,250})/iu,
      /(?:^|\n)项目\s+([A-Z][\s\S]{10,350}?)(?=\n主要完成人)/mu,
    ],
    250,
  )
    .replace(/[“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const email = firstMatch(
    front,
    [/(?:电子)?邮\s*箱\s*[：:]?\s*([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/u],
    100,
  );
  const phone = firstMatch(
    front,
    [
      /(?:联系)?电\s*话\s*[：:]?\s*((?:\+?86[- ]?)?(?:1\d{10}|0\d{2,3}[- ]?\d{7,8}))/u,
    ],
    40,
  );
  const contact = firstMatch(
    front,
    [/(?:联\s*系\s*人|联系人姓名)\s*[：:]?\s*([\u3400-\u9fff·]{2,8})/u],
    30,
  );
  const dateMatch = front.match(
    /(?:项目)?起止时间[\s\S]{0,80}?(20\d{2})\s*[年.\-/]\s*(\d{1,2})\s*[月.\-/]\s*(\d{1,2})\s*[日号]?[^\n]{0,50}?(20\d{2})\s*[年.\-/]\s*(\d{1,2})\s*[月.\-/]\s*(\d{1,2})/u,
  );
  const dateValue = (y, m, d) =>
    y ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  return {
    ...(projectNameEn ? { projectNameEn } : {}),
    ...(contact ? { contact } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(dateMatch
      ? {
          startDate: dateValue(dateMatch[1], dateMatch[2], dateMatch[3]),
          endDate: dateValue(dateMatch[4], dateMatch[5], dateMatch[6]),
        }
      : {}),
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractPeople(text) {
  const marker = /(?:附件\s*)?6\s*主要(?:发明人|完成人)身份证/g;
  const starts = [...text.matchAll(marker)].map((match) => match.index);
  for (const start of starts.reverse()) {
    const section = text.slice(start, start + 12000);
    const end = section.search(/(?:附件\s*)?7(?:\.1)?\s*主要完成单位/);
    const candidate = end > 0 ? section.slice(0, end) : section;
    const names = unique(
      [
        ...candidate.matchAll(
          /^\s*\d{1,2}\s*[、.．]\s*([\u3400-\u9fff·]{2,8})\s*$/gmu,
        ),
      ].map((match) => match[1].replace(/\s/g, "")),
    );
    if (names.length) return names.slice(0, 30);
  }
  const forms = between(
    text,
    /六[、.．]\s*主要完成人情况表/,
    /七[、.．]\s*主要完成单位情况表/,
  );
  const names = unique(
    [
      ...forms.matchAll(
        /姓\s*名\s*[：:]?\s*([\u3400-\u9fff·]{2,8})(?=\s+(?:性\s*别|排\s*名|出\s*生))/gmu,
      ),
    ].map((match) => match[1].replace(/\s/g, "")),
  );
  if (names.length) return names.slice(0, 30);
  return [];
}

function extractUnits(text) {
  const directoryUnits = unique(
    [
      ...text.matchAll(
        /附件\s*7\.\d+\s*主要完成单位营业执照[：:]\s*([^\n]+?)(?=\s*\.{2,}|\s+\d+\s*$|$)/gmu,
      ),
    ].map((match) =>
      match[1]
        .replace(/[\s.。·]+$/g, "")
        .replace(/\s+/g, "")
        .trim(),
    ),
  ).slice(0, 30);
  if (directoryUnits.length) return directoryUnits;
  const forms = between(
    text,
    /七[、.．]\s*主要完成单位情况表/,
    /八[、.．]\s*(?:申报|推荐|申报、推荐)单位意见/,
  );
  return unique(
    [...forms.matchAll(/单位名称\s*[：:]?\s*([^\n]{4,80})/gmu)].map((match) =>
      match[1]
        .replace(/\s{2,}.+$/, "")
        .replace(/[：:\s]+$/g, "")
        .trim(),
    ),
  ).slice(0, 30);
}

function analyzeText(text, originalName, extractionMeta = {}) {
  const projectName = titleFromText(text) || titleFromFilename(originalName);
  const basic = extractBasicFields(text);
  const projectSource = extractProjectSourceFields(text);
  const sections = {
    introduction: cleanSection(
      between(
        text,
        /二[、.．]\s*项\s*目\s*简\s*介/,
        /三[、.．]\s*项\s*目\s*详\s*细/,
      ),
      4000,
    ),
    background: cleanSection(
      between(text, /1[.．、]\s*立项背景/, /2[.．、]\s*详细技术内容/),
      4000,
    ),
    technicalContent: cleanSection(
      between(
        text,
        /2[.．、]\s*详细技术内容(?:或科学研究内容)?/,
        /3[.．、]\s*主要(?:发现点|技术发明点|技术创新点)/,
      ),
    ),
    innovations: cleanSection(
      between(
        text,
        /3[.．、]\s*主要(?:发现点|技术发明点|技术创新点)/,
        /4[.．、]\s*与当前国内外同类技术/,
      ),
      5000,
    ),
    comparison: cleanSection(
      between(text, /4[.．、]\s*与当前国内外同类技术/, /5[.．、]\s*应用情况/),
      10000,
    ),
    application: cleanSection(
      between(text, /5[.．、]\s*应用情况/, /6[、.．]\s*经济效益/),
      5000,
    ),
    economic: cleanSection(
      between(text, /6[、.．]\s*经济效益/, /7[、.．]\s*社会效益/),
      5000,
    ),
    social: cleanSection(
      between(text, /7[、.．]\s*社会效益/, /四[、.．]\s*本项目曾获奖励情况/),
      4000,
    ),
  };
  const people = extractPeople(text);
  const units = extractUnits(text);
  const recognized = [];
  const addRecognition = (key, field, value, confidence, source) => {
    if (!value || (Array.isArray(value) && !value.length)) return;
    recognized.push({
      key,
      field,
      value: Array.isArray(value) ? value.join("、") : value,
      confidence,
      source,
    });
  };
  addRecognition(
    "projectName",
    "项目名称（中文）",
    projectName,
    titleFromText(text) ? 0.94 : 0.96,
    titleFromText(text) ? "申报书基本情况字段" : "文件名",
  );
  const basicMetadata = [
    ["projectNameEn", "项目名称（英文）", 0.84, "申报书基本情况英文名称栏"],
    ["contact", "联系人", 0.82, "申报书联系人栏"],
    ["phone", "联系电话", 0.86, "申报书联系电话栏"],
    ["email", "邮箱", 0.9, "申报书邮箱栏"],
    ["startDate", "项目起始时间", 0.8, "申报书项目起止时间栏"],
    ["endDate", "项目完成时间", 0.8, "申报书项目起止时间栏"],
  ];
  for (const [key, label, confidence, source] of basicMetadata)
    addRecognition(key, label, basic[key], confidence, source);
  addRecognition(
    "sources",
    "项目来源（多选）",
    projectSource.sources,
    0.78,
    "申报书基本情况“项目来源”勾选栏",
  );
  addRecognition(
    "plans",
    "具体计划、基金名称和编号",
    projectSource.plans,
    0.86,
    "申报书基本情况“具体计划、基金名称和编号”栏",
  );
  addRecognition(
    "people",
    "主要完成人",
    people,
    people.length > 1 ? 0.9 : 0.76,
    "附件“主要完成人/发明人身份证”编号清单",
  );
  addRecognition(
    "units",
    "主要完成单位",
    units,
    units.length > 1 ? 0.94 : 0.8,
    "附件“主要完成单位营业执照”目录",
  );
  addRecognition(
    "applicantUnit",
    "第一申报单位",
    units[0],
    0.86,
    "主要完成单位排序第 1 位",
  );
  const sectionMetadata = [
    ["introduction", "项目简介", 0.92, "正文“二、项目简介”"],
    ["background", "立项背景", 0.9, "正文“1.立项背景”"],
    ["technicalContent", "详细技术内容", 0.88, "正文“2.详细技术内容”"],
    ["innovations", "主要技术创新点", 0.9, "正文“3.主要创新点”"],
    ["comparison", "同类技术比较", 0.86, "正文“4.与当前国内外同类技术比较”"],
    ["application", "应用情况", 0.88, "正文“5.应用情况”"],
    ["economic", "经济效益", 0.84, "正文“6.经济效益”"],
    ["social", "社会效益", 0.88, "正文“7.社会效益”"],
  ];
  for (const [key, label, confidence, source] of sectionMetadata) {
    addRecognition(key, label, sections[key], confidence, source);
  }
  const fields = {
    ...(projectName ? { projectName } : {}),
    ...basic,
    ...projectSource,
    ...(people.length ? { people } : {}),
    ...(units.length ? { units, applicantUnit: units[0] } : {}),
  };
  for (const [key] of sectionMetadata) {
    if (sections[key]) fields[key] = sections[key];
  }
  const warnings = [];
  if (extractionMeta.ocrPages)
    warnings.push(
      `首页缺少文本层，已自动完成 ${extractionMeta.ocrPages} 页中英文 OCR；请对照原件复核表格字段。`,
    );
  if (text.length < 500) {
    warnings.push(
      "该 PDF 可提取文本较少，可能是纯扫描件；当前环境未启用 OCR，请人工录入或上传带文本层的 PDF。",
    );
  } else {
    warnings.push(
      "人员姓名已从编号清单提取，但生僻字和扫描页文字仍应对照原件逐项确认后再应用。",
    );
  }
  if (!people.length)
    warnings.push("未定位到结构化完成人清单，未自动覆盖主要完成人字段。");
  if (!units.length)
    warnings.push("未定位到完成单位营业执照目录，未自动覆盖主要完成单位字段。");
  if (
    extractionMeta.totalPages &&
    extractionMeta.analyzedPages < extractionMeta.totalPages
  )
    warnings.push(
      `文档共 ${extractionMeta.totalPages} 页，为控制资源占用仅分析前 ${extractionMeta.analyzedPages} 页。`,
    );
  return {
    fields,
    recognized,
    warnings,
    extractedCharacters: text.length,
    ...extractionMeta,
  };
}

async function extractPdf(file) {
  const originalName = normalizeUploadedName(file.originalname);
  let totalPages = 0;
  try {
    const { stdout: info } = await execFileAsync("pdfinfo", [file.path], {
      encoding: "utf8",
      timeout: Math.min(pdfCommandTimeoutMs, 30_000),
      windowsHide: true,
    });
    totalPages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] || 0);
  } catch {
    totalPages = 0;
  }
  const analyzedPages = Math.min(totalPages || 500, 500);
  const { stdout } = await execFileAsync(
    "pdftotext",
    [
      "-enc",
      "UTF-8",
      "-layout",
      "-f",
      "1",
      "-l",
      String(analyzedPages),
      file.path,
      "-",
    ],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: pdfCommandTimeoutMs,
      windowsHide: true,
    },
  );
  let ocrText = "";
  let ocrPages = 0;
  const firstPageText = stdout.split("\f")[0] || "";
  if (!/项目名称|主要完成人|第一申报单位/.test(firstPageText)) {
    const ocrDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "ceca-award-ocr-"),
    );
    const imagePrefix = path.join(ocrDir, "page-1");
    try {
      await execFileAsync(
        "pdftoppm",
        [
          "-f",
          "1",
          "-l",
          "1",
          "-r",
          "180",
          "-png",
          "-singlefile",
          file.path,
          imagePrefix,
        ],
        {
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024,
          timeout: pdfCommandTimeoutMs,
        },
      );
      const worker = await createWorker("chi_sim", 1, {
        langPath: chiSimData.langPath,
        cachePath: ocrDir,
      });
      try {
        const result = await withTimeout(
          worker.recognize(`${imagePrefix}.png`),
          pdfCommandTimeoutMs,
          "OCR 处理超时",
        );
        ocrText = String(result.data.text || "")
          .replace(/(?<=[\u3400-\u9fff])[ \t]+(?=[\u3400-\u9fff])/gu, "")
          .replace(/\n名称\s+(?=[A-Z])/gu, "\n")
          .replace(/[ \t]+/g, " ");
        ocrPages = ocrText.trim() ? 1 : 0;
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      console.warn(`OCR skipped for ${originalName}: ${error.message}`);
    } finally {
      await fsPromises.rm(ocrDir, { recursive: true, force: true });
    }
  }
  return {
    fileName: originalName,
    ...analyzeText(`${ocrText}\n\n${stdout}`, originalName, {
      analyzedPages,
      totalPages,
      ocrPages,
    }),
  };
}

async function pdfPageCount(filePath) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [filePath], {
      encoding: "utf8",
      windowsHide: true,
    });
    return Math.max(1, Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 1));
  } catch {
    return 1;
  }
}

function isSectionSubmission(row) {
  return (
    row?.file_type?.startsWith("section_word:") ||
    row?.file_type?.startsWith("section_document:") ||
    row?.file_type?.startsWith("section_signed:")
  );
}

function isPreviewableSubmission(row) {
  const extension = path.extname(row?.file_name || "").toLowerCase();
  if (isSectionSubmission(row)) return extension !== ".doc";
  return (
    !["source_pdf"].includes(row?.file_type) &&
    !row?.file_type?.startsWith("content_image:") &&
    [".pdf", ".jpg", ".jpeg", ".png"].includes(extension)
  );
}

function sectionPreviewDirectory(row) {
  return path.join(path.dirname(row.stored_path), `preview-${row.id}`);
}

async function buildSectionPreview(row) {
  const extension = path.extname(row.file_name).toLowerCase();
  if (extension === ".docx") {
    return [
      {
        path: row.stored_path,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "word",
      },
    ];
  }
  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return [
      {
        path: row.stored_path,
        mimeType: row.mime_type || "image/png",
        format: "image",
      },
    ];
  }

  const previewDirectory = sectionPreviewDirectory(row);
  const manifestPath = path.join(previewDirectory, "manifest.json");
  const cached = await fsPromises
    .readFile(manifestPath, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (cached?.pages?.length) {
    const pages = cached.pages.map((fileName) => ({
      path: path.join(previewDirectory, fileName),
      mimeType: "image/png",
      format: "image",
    }));
    if (pages.every((page) => fs.existsSync(page.path))) return pages;
  }

  await fsPromises.rm(previewDirectory, { recursive: true, force: true });
  await fsPromises.mkdir(previewDirectory, { recursive: true });
  const pdfPath = row.stored_path;
  try {
    const pagePrefix = path.join(previewDirectory, "page");
    try {
      await execFileAsync(
        "pdftoppm",
        ["-png", "-r", "144", pdfPath, pagePrefix],
        {
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
          timeout: pdfCommandTimeoutMs,
        },
      );
    } catch (error) {
      throw new Error(`文件预览生成失败：${error.message}`);
    }
    const pageNames = (await fsPromises.readdir(previewDirectory))
      .filter((fileName) => /^page-\d+\.png$/i.test(fileName))
      .sort(
        (left, right) =>
          Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]),
      );
    if (!pageNames.length) throw new Error("文件预览没有可显示的页面");
    await fsPromises.writeFile(
      manifestPath,
      JSON.stringify({ pages: pageNames }),
      "utf8",
    );
    db.prepare("UPDATE application_files SET page_count = ? WHERE id = ?").run(
      pageNames.length,
      row.id,
    );
    return pageNames.map((fileName) => ({
      path: path.join(previewDirectory, fileName),
      mimeType: "image/png",
      format: "image",
    }));
  } catch (error) {
    await fsPromises.rm(previewDirectory, { recursive: true, force: true });
    throw error;
  }
}

function ensureSectionPreview(row) {
  const key = Number(row.id);
  if (!sectionPreviewJobs.has(key)) {
    sectionPreviewJobs.set(
      key,
      buildSectionPreview(row).finally(() => sectionPreviewJobs.delete(key)),
    );
  }
  return sectionPreviewJobs.get(key);
}

const count = db
  .prepare(
    "SELECT COUNT(*) AS total FROM applications WHERE archived_at IS NULL",
  )
  .get().total;
if (count === 0) {
  const timestamp = now();
  const title = "规模化分布式光伏安全灵活接入与节能运行控制技术及应用";
  const seed = {
    year: "2026",
    awardType: "节能减排科技进步奖",
    projectName: title,
  };
  const result = db
    .prepare(
      `INSERT INTO applications
    (title, award_type, year, status, progress, data_json, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`,
    )
    .run(
      title,
      seed.awardType,
      2026,
      calculateProgress(seed),
      JSON.stringify(seed),
      timestamp,
      timestamp,
    );
  writeAudit(Number(result.lastInsertRowid), "create", "初始化示例申报项目");
}

app.get("/api/applications", (req, res) => {
  const year = Number(req.query.year || 0);
  const status = String(req.query.status || "");
  const keyword = String(req.query.keyword || "").trim();
  const clauses = ["archived_at IS NULL", "owner_id = ?"];
  const params = [req.user.id];
  if (year) {
    clauses.push("year = ?");
    params.push(year);
  }
  if (status && status !== "all") {
    clauses.push("status = ?");
    params.push(status);
  }
  if (keyword) {
    clauses.push("title LIKE ?");
    params.push(`%${keyword}%`);
  }
  const rows = db
    .prepare(
      `SELECT id, title, award_type, year, status, progress, created_at, updated_at
    FROM applications WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC`,
    )
    .all(...params);
  res.json({ ok: true, list: rows, total: rows.length });
});

app.post("/api/applications", (req, res) => {
  const title = String(req.body.title || "").trim();
  const requestedAwardType = String(req.body.awardType || AWARD_TYPES.PROGRESS);
  const profile = getAwardProfile(requestedAwardType);
  const awardType = profile.value;
  const year = Number(req.body.year || new Date().getFullYear());
  const applicationChannel = String(req.body.applicationChannel || "自由申报");
  const applicantUnit = String(req.body.applicantUnit || "").trim();
  const workflowMode =
    profile.mode === "project" && req.body.workflowMode === "document"
      ? "document"
      : "form";
  if (!awardProfiles.some(({ value }) => value === requestedAwardType))
    return res.status(422).json({ ok: false, message: "请选择有效的奖项类别" });
  if (!title)
    return res.status(422).json({
      ok: false,
      message:
        profile.mode === "individual" ? "请填写候选人姓名" : "请填写项目名称",
    });
  const data = {
    schemaVersion: 2,
    profileCode: profile.code,
    year: String(year),
    awardType,
    applicationMode: profile.mode,
    applicationChannel,
    applicantUnit,
    projectName: title,
    workflowMode,
  };
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO applications
    (title, award_type, year, status, progress, data_json, created_at, updated_at, owner_id)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      awardType,
      year,
      calculateProgress(data),
      JSON.stringify(data),
      timestamp,
      timestamp,
      req.user.id,
    );
  const id = Number(result.lastInsertRowid);
  writeAudit(id, "create", "新建申报项目");
  res.status(201).json({
    ok: true,
    application: applicationFromRow(
      db.prepare("SELECT * FROM applications WHERE id = ?").get(id),
    ),
  });
});

app.get("/api/applications/:id", (req, res) => {
  const row = ownedApplication(Number(req.params.id), req.user.id);
  if (!row)
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  res.json({ ok: true, application: applicationFromRow(row) });
});

app.put("/api/applications/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = ownedApplication(id, req.user.id);
  if (!row)
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  const data = sanitizeApplicationRichTextData({
    ...parseData(row.data_json),
    ...(req.body.data || {}),
  });
  const profile = getAwardProfile(row.award_type);
  data.awardType = profile.value;
  data.applicationMode = profile.mode;
  data.profileCode = profile.code;
  data.schemaVersion = 2;
  const title =
    String(data.projectName || req.body.title || row.title).trim() ||
    "未命名申报项目";
  const awardType = profile.value;
  const year = Number(data.year || row.year);
  const status = String(req.body.status || row.status);
  const progress = calculateProgress(data);
  const timestamp = now();
  db.prepare(
    `UPDATE applications SET title = ?, award_type = ?, year = ?, status = ?, progress = ?,
    data_json = ?, updated_at = ? WHERE id = ?`,
  ).run(
    title,
    awardType,
    year,
    status,
    progress,
    JSON.stringify(data),
    timestamp,
    id,
  );
  writeAudit(id, "save", `保存进度 ${progress}%`);
  res.json({
    ok: true,
    application: applicationFromRow(
      db.prepare("SELECT * FROM applications WHERE id = ?").get(id),
    ),
  });
});

app.post("/api/applications/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const row = ownedApplication(id, req.user.id);
  if (!row)
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  const data = parseData(row.data_json);
  data.projectName = `${row.title}（副本）`;
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO applications
    (title, award_type, year, status, progress, data_json, created_at, updated_at, owner_id)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    )
    .run(
      data.projectName,
      row.award_type,
      row.year,
      calculateProgress(data),
      JSON.stringify(data),
      timestamp,
      timestamp,
      req.user.id,
    );
  const newId = Number(result.lastInsertRowid);
  writeAudit(newId, "duplicate", `复制自项目 ${id}`);
  res.status(201).json({
    ok: true,
    application: applicationFromRow(
      db.prepare("SELECT * FROM applications WHERE id = ?").get(newId),
    ),
  });
});

app.post("/api/applications/:id/submit", (req, res) => {
  const id = Number(req.params.id);
  const row = ownedApplication(id, req.user.id);
  if (!row)
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  const data = parseData(row.data_json);
  const profile = getAwardProfile(row.award_type);
  const files = db
    .prepare(
      "SELECT DISTINCT file_type FROM application_files WHERE application_id = ?",
    )
    .all(id);
  const missing = validateApplication({
    data,
    awardType: profile.value,
    files,
  }).map(({ message }) => message.replace(/^请(?:填写|上传)/, ""));
  if (profile.code === "achievement") {
    if (data.candidate?.birthDate) {
      const birthDate = parseApplicationDate(data.candidate.birthDate, "start");
      const applicationYear = Number(data.year || row.year);
      if (!birthDate || birthDate > new Date(Date.UTC(applicationYear, 11, 31)))
        missing.push("候选人出生年月格式无效");
      else if (applicationYear - birthDate.getUTCFullYear() > 60)
        missing.push("候选人申报年末年龄须在 60 周岁及以下");
    }
    if ((data.paperRecords || []).length > 10)
      missing.push("代表性论文和专著不得超过 10 篇（册）");
    if ((data.ipRecords || []).length > 10)
      missing.push("代表性知识产权不得超过 10 项");
  }
  if (profile.mode === "project") {
    if ((data.people || []).length > profile.maxPeople)
      missing.push(`主要完成人不得超过 ${profile.maxPeople} 人`);
    if (profile.maxUnits && (data.units || []).length > profile.maxUnits)
      missing.push(`主要完成单位不得超过 ${profile.maxUnits} 个`);
    if (
      !hasMinimumApplicationDuration(
        data.applicationUnits,
        profile.minimumApplicationYears,
        Number(data.year || row.year),
      )
    )
      missing.push(
        `至少一家应用单位的实际应用时间须满 ${profile.minimumApplicationYears} 年`,
      );
  }
  if (missing.length) {
    return res.status(422).json({
      ok: false,
      message: `提交前请完善：${missing.join("、")}`,
      missing,
    });
  }
  db.prepare(
    "UPDATE applications SET status = 'submitted', progress = 100, updated_at = ? WHERE id = ?",
  ).run(now(), id);
  writeAudit(id, "submit", "提交形式审查");
  res.json({ ok: true, message: "已提交形式审查" });
});

app.delete("/api/applications/:id", (req, res) => {
  const id = Number(req.params.id);
  const timestamp = now();
  const result = db
    .prepare(
      "UPDATE applications SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND archived_at IS NULL",
    )
    .run(timestamp, timestamp, id, req.user.id);
  if (!result.changes)
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  writeAudit(id, "archive", "项目移入归档");
  res.json({ ok: true });
});

app.get("/api/applications/:id/files", (req, res) => {
  if (!ownedApplication(Number(req.params.id), req.user.id))
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  const rows = db
    .prepare(
      "SELECT id, file_name, file_type, file_size, page_count, mime_type, created_at FROM application_files WHERE application_id = ? ORDER BY id DESC",
    )
    .all(Number(req.params.id));
  res.json({ ok: true, list: rows });
});

app.post(
  "/api/applications/:id/files",
  materialUpload.single("file"),
  async (req, res) => {
    const applicationId = Number(req.params.id);
    const exists = ownedApplication(applicationId, req.user.id);
    if (!exists) {
      if (req.file) await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ ok: false, message: "申报项目不存在" });
    }
    if (!req.file)
      return res.status(400).json({ ok: false, message: "请选择附件" });
    const fileName = normalizeUploadedName(req.file.originalname);
    const category = String(req.body.category || "other");
    const profile = getAwardProfile(exists.award_type);
    const isContentImage = category.startsWith("content_image:");
    const isSectionWord = category.startsWith("section_word:");
    const isSectionDocument = category.startsWith("section_document:");
    const isSignedSection = category.startsWith("section_signed:");
    const validSectionWord = new RegExp(
      `^section_word:${profile.code}:[a-zA-Z]+$`,
    ).test(category);
    const validSignedSection = new RegExp(
      `^section_signed:${profile.code}:(authenticity|confidentiality|integrity)$`,
    ).test(category);
    const validSectionDocument = new RegExp(
      `^section_document:${profile.code}:(unitRecommendation|expertRecommendation|peopleCooperation)$`,
    ).test(category);
    const allowedCategories = new Set([
      ...profile.recommendationMaterials.map(([value]) => value),
      ...profile.attachmentMaterials.map(([value]) => value),
    ]);
    if (
      !isContentImage &&
      !allowedCategories.has(category) &&
      !validSectionWord &&
      !validSectionDocument &&
      !validSignedSection
    ) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({ ok: false, message: "附件类别无效" });
    }
    if (
      isContentImage &&
      !String(req.file.mimetype || "").startsWith("image/")
    ) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res
        .status(422)
        .json({ ok: false, message: "正文中只能插入 JPG 或 PNG 图片" });
    }
    const extension = path.extname(fileName).toLowerCase();
    if (isSectionWord && ![".doc", ".docx"].includes(extension)) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({
        ok: false,
        message: "章节文件仅支持 DOC、DOCX",
      });
    }
    if (
      isSectionDocument &&
      ![".doc", ".docx", ".pdf"].includes(extension)
    ) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({
        ok: false,
        message: "章节回传文件仅支持 DOC、DOCX、PDF",
      });
    }
    if (
      isSignedSection &&
      ![".pdf", ".jpg", ".jpeg", ".png"].includes(extension)
    ) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({
        ok: false,
        message: "签字盖章文件仅支持 PDF、JPG、PNG",
      });
    }
    if (
      !isSectionWord &&
      !isSectionDocument &&
      !isSignedSection &&
      !isContentImage &&
      ![".pdf", ".jpg", ".jpeg", ".png"].includes(extension)
    ) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res.status(422).json({
        ok: false,
        message: "证明附件仅支持 PDF、JPG、PNG",
      });
    }
    const categoryLimit = profile.fileLimits[category];
    if (categoryLimit) {
      const categoryCount = Number(
        db
          .prepare(
            "SELECT COUNT(*) AS total FROM application_files WHERE application_id = ? AND file_type = ?",
          )
          .get(applicationId, category).total || 0,
      );
      if (categoryCount >= categoryLimit) {
        await fsPromises.unlink(req.file.path).catch(() => {});
        return res.status(422).json({
          ok: false,
          message: `该类材料不得超过 ${categoryLimit} 个文件`,
        });
      }
    }
    const projectDir = path.join(dataDir, "files", String(applicationId));
    await fsPromises.mkdir(projectDir, { recursive: true });
    const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const storedPath = path.join(
      projectDir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`,
    );
    await persistUploadedFile(req.file.path, storedPath);
    let pageCount = extension === ".pdf" ? await pdfPageCount(storedPath) : 1;
    const attachmentCategories = profile.attachmentMaterials.map(
      ([value]) => value,
    );
    const shouldLimitPages = attachmentCategories.includes(category);
    if (shouldLimitPages) {
      const placeholders = attachmentCategories.map(() => "?").join(", ");
      const currentPages = Number(
        db
          .prepare(
            `SELECT COALESCE(SUM(page_count), 0) AS total
             FROM application_files
             WHERE application_id = ? AND file_type IN (${placeholders})`,
          )
          .get(applicationId, ...attachmentCategories).total || 0,
      );
      if (currentPages + pageCount > 40) {
        await fsPromises.unlink(storedPath).catch(() => {});
        return res.status(422).json({
          ok: false,
          message: `附件总页数不得超过 40 页；当前 ${currentPages} 页，本文件 ${pageCount} 页`,
        });
      }
    }
    const timestamp = now();
    const result = db
      .prepare(
        `INSERT INTO application_files
          (application_id, file_name, file_type, file_size, stored_path, page_count, mime_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        applicationId,
        fileName,
        category,
        req.file.size,
        storedPath,
        pageCount,
        req.file.mimetype,
        timestamp,
      );
    const fileId = Number(result.lastInsertRowid);
    if (
      (isSectionWord && extension !== ".doc") ||
      (isSectionDocument && extension !== ".doc") ||
      isSignedSection
    ) {
      try {
        const previewPages = await ensureSectionPreview({
          id: fileId,
          file_name: fileName,
          file_type: category,
          stored_path: storedPath,
          mime_type: req.file.mimetype,
        });
        pageCount = previewPages.length;
      } catch (error) {
        db.prepare("DELETE FROM application_files WHERE id = ?").run(fileId);
        await fsPromises.rm(
          sectionPreviewDirectory({ id: fileId, stored_path: storedPath }),
          {
            recursive: true,
            force: true,
          },
        );
        await fsPromises.unlink(storedPath).catch(() => {});
        return res.status(422).json({
          ok: false,
          message: error.message || "无法生成章节文件预览",
        });
      }
    }
    writeAudit(applicationId, "file_upload", `上传附件 ${fileName}`);
    res.status(201).json({
      ok: true,
      file: {
        id: fileId,
        file_name: fileName,
        file_type: category,
        file_size: req.file.size,
        page_count: pageCount,
        mime_type: req.file.mimetype,
        created_at: timestamp,
      },
    });
  },
);

app.delete(
  "/api/applications/:applicationId/files/:fileId",
  async (req, res) => {
    const applicationId = Number(req.params.applicationId);
    const fileId = Number(req.params.fileId);
    if (!ownedApplication(applicationId, req.user.id))
      return res.status(404).json({ ok: false, message: "申报项目不存在" });
    const row = db
      .prepare(
        "SELECT * FROM application_files WHERE id = ? AND application_id = ?",
      )
      .get(fileId, applicationId);
    if (!row) return res.status(404).json({ ok: false, message: "附件不存在" });
    db.prepare("DELETE FROM application_files WHERE id = ?").run(fileId);
    if (row.stored_path) {
      await fsPromises.rm(sectionPreviewDirectory(row), {
        recursive: true,
        force: true,
      });
      await fsPromises.unlink(row.stored_path).catch(() => {});
      await fsPromises.rmdir(path.dirname(row.stored_path)).catch(() => {});
    }
    writeAudit(applicationId, "file_delete", `删除附件 ${row.file_name}`);
    res.json({ ok: true });
  },
);

app.get(
  "/api/applications/:applicationId/files/:fileId/download",
  (req, res) => {
    const applicationId = Number(req.params.applicationId);
    if (!ownedApplication(applicationId, req.user.id))
      return res.status(404).json({ ok: false, message: "申报项目不存在" });
    const row = db
      .prepare(
        "SELECT * FROM application_files WHERE id = ? AND application_id = ?",
      )
      .get(Number(req.params.fileId), applicationId);
    if (!row?.stored_path || !fs.existsSync(row.stored_path))
      return res.status(404).json({ ok: false, message: "文件不存在" });
    const disposition = req.query.inline === "1" ? "inline" : "attachment";
    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
    );
    res.sendFile(path.resolve(row.stored_path));
  },
);

app.get(
  "/api/applications/:applicationId/files/:fileId/preview",
  async (req, res) => {
    const applicationId = Number(req.params.applicationId);
    if (!ownedApplication(applicationId, req.user.id))
      return res.status(404).json({ ok: false, message: "申报项目不存在" });
    const row = db
      .prepare(
        "SELECT * FROM application_files WHERE id = ? AND application_id = ?",
      )
      .get(Number(req.params.fileId), applicationId);
    if (!row?.stored_path || !fs.existsSync(row.stored_path))
      return res.status(404).json({ ok: false, message: "文件不存在" });
    if (!isPreviewableSubmission(row))
      return res
        .status(422)
        .json({ ok: false, message: "该文件不支持合并预览" });
    try {
      const pages = await ensureSectionPreview(row);
      res.json({
        ok: true,
        fileName: row.file_name,
        pageCount: pages.length,
        pages: pages.map((page, index) => ({
          page: index + 1,
          format: page.format,
          url: `/api/applications/${applicationId}/files/${row.id}/preview/${index + 1}`,
        })),
      });
    } catch (error) {
      res.status(422).json({
        ok: false,
        message: error.message || "无法生成章节文件预览",
      });
    }
  },
);

app.get(
  "/api/applications/:applicationId/files/:fileId/preview/:page",
  async (req, res) => {
    const applicationId = Number(req.params.applicationId);
    if (!ownedApplication(applicationId, req.user.id))
      return res.status(404).json({ ok: false, message: "申报项目不存在" });
    const row = db
      .prepare(
        "SELECT * FROM application_files WHERE id = ? AND application_id = ?",
      )
      .get(Number(req.params.fileId), applicationId);
    if (!row?.stored_path || !fs.existsSync(row.stored_path))
      return res.status(404).json({ ok: false, message: "文件不存在" });
    if (!isPreviewableSubmission(row))
      return res
        .status(422)
        .json({ ok: false, message: "该文件不支持合并预览" });
    try {
      const pages = await ensureSectionPreview(row);
      const pageIndex = Number(req.params.page) - 1;
      const page = pages[pageIndex];
      if (!page)
        return res.status(404).json({ ok: false, message: "预览页不存在" });
      res.setHeader("Content-Type", page.mimeType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Content-Disposition", "inline");
      res.sendFile(path.resolve(page.path));
    } catch (error) {
      res.status(422).json({
        ok: false,
        message: error.message || "无法读取章节文件预览",
      });
    }
  },
);

async function extractAndStorePdf(file, applicationId, userId) {
  const result = await extractPdf(file);
  let sourceFile = null;
  if (applicationId) {
    if (!ownedApplication(applicationId, userId))
      throw new Error("申报项目不存在");
    const projectDir = path.join(dataDir, "files", String(applicationId));
    await fsPromises.mkdir(projectDir, { recursive: true });
    const safeName = result.fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const storedPath = path.join(
      projectDir,
      `${Date.now()}-source-${safeName}`,
    );
    await persistUploadedFile(file.path, storedPath);
    const insert = db
      .prepare(
        `INSERT INTO application_files
        (application_id, file_name, file_type, file_size, stored_path, page_count, mime_type, extraction_json, created_at)
        VALUES (?, ?, 'source_pdf', ?, ?, ?, 'application/pdf', ?, ?)`,
      )
      .run(
        applicationId,
        result.fileName,
        file.size,
        storedPath,
        result.totalPages || 1,
        JSON.stringify(result),
        now(),
      );
    sourceFile = {
      id: Number(insert.lastInsertRowid),
      file_name: result.fileName,
      page_count: result.totalPages || 1,
    };
    writeAudit(applicationId, "pdf_import", `识别文件 ${result.fileName}`);
    file.path = "";
  }
  return { ...result, sourceFile };
}

function pendingExtractionCounts(userId) {
  let total = 0;
  let user = 0;
  for (const job of extractionJobs.values()) {
    if (job.status !== "queued" && job.status !== "processing") continue;
    total += 1;
    if (job.userId === userId) user += 1;
  }
  for (const upload of pdfUploads.values()) {
    if (upload.status !== "assembling") continue;
    total += 1;
    if (upload.userId === userId) user += 1;
  }
  return { total, user };
}

function extractionCapacityAvailable(userId) {
  const pending = pendingExtractionCounts(userId);
  return (
    pending.total < maxPendingExtractions &&
    pending.user < maxPendingExtractionsPerUser
  );
}

function activeUploadUsage(userId) {
  let count = 0;
  let bytes = 0;
  let userCount = 0;
  let userBytes = 0;
  for (const upload of pdfUploads.values()) {
    if (upload.status !== "uploading" && upload.status !== "assembling")
      continue;
    count += 1;
    bytes += upload.size;
    if (upload.userId === userId) {
      userCount += 1;
      userBytes += upload.size;
    }
  }
  return { count, bytes, userCount, userBytes };
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function hasPdfHeader(filePath) {
  const handle = await fsPromises.open(filePath, "r");
  try {
    const header = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead).includes(Buffer.from("%PDF-"));
  } finally {
    await handle.close();
  }
}

function processExtractionQueue() {
  while (activeExtractions < extractionConcurrency && extractionQueue.length) {
    const { job, file, applicationId, userId } = extractionQueue.shift();
    activeExtractions += 1;
    job.status = "processing";
    void extractAndStorePdf(file, applicationId, userId)
      .then((result) => {
        job.status = "completed";
        job.result = result;
      })
      .catch((error) => {
        job.status = "failed";
        job.message = `PDF 解析失败：${error.message}`;
      })
      .finally(async () => {
        if (file.path) await fsPromises.unlink(file.path).catch(() => {});
        job.finishedAt = Date.now();
        activeExtractions -= 1;
        processExtractionQueue();
      });
  }
}

function startExtractionJob(file, applicationId, userId) {
  const jobId = randomBytes(18).toString("base64url");
  const job = {
    userId,
    status: "queued",
    result: null,
    message: "",
    finishedAt: null,
  };
  extractionJobs.set(jobId, job);
  extractionQueue.push({ job, file, applicationId, userId });
  processExtractionQueue();
  return jobId;
}

app.post("/api/pdf-uploads", async (req, res) => {
  const fileName = normalizeUploadedName(String(req.body.fileName || ""));
  const size = Number(req.body.size || 0);
  const applicationId = Number(req.body.applicationId || 0);
  if (!fileName.toLowerCase().endsWith(".pdf"))
    return res.status(400).json({ ok: false, message: "仅支持 PDF 文件" });
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxPdfSize)
    return res
      .status(400)
      .json({ ok: false, message: "PDF 文件大小必须在 100 MB 以内" });
  if (applicationId && !ownedApplication(applicationId, req.user.id))
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  const usage = activeUploadUsage(req.user.id);
  if (
    usage.count >= maxActivePdfUploads ||
    usage.userCount >= maxActivePdfUploadsPerUser ||
    usage.bytes + size > maxActivePdfUploadBytes ||
    usage.userBytes + size > maxActivePdfUploadBytesPerUser
  )
    return res
      .status(503)
      .json({ ok: false, message: "当前上传任务较多，请稍后重试" });

  const uploadId = randomBytes(18).toString("base64url");
  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "ceca-award-upload-"),
  );
  const totalChunks = Math.ceil(size / pdfChunkSize);
  pdfUploads.set(uploadId, {
    userId: req.user.id,
    applicationId,
    fileName,
    size,
    totalChunks,
    received: new Set(),
    directory,
    status: "uploading",
    lastActivityAt: Date.now(),
    jobId: "",
  });
  res
    .status(201)
    .json({ ok: true, uploadId, chunkSize: pdfChunkSize, totalChunks });
});

app.put(
  "/api/pdf-uploads/:uploadId/chunks/:index",
  express.raw({ type: "application/octet-stream", limit: pdfChunkSize }),
  async (req, res) => {
    const upload = pdfUploads.get(req.params.uploadId);
    if (!upload || upload.userId !== req.user.id)
      return res
        .status(404)
        .json({ ok: false, message: "上传任务不存在或已过期" });
    if (upload.status !== "uploading")
      return res
        .status(409)
        .json({ ok: false, message: "上传已进入组装或识别阶段" });
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= upload.totalChunks)
      return res.status(400).json({ ok: false, message: "分片序号无效" });
    const expectedSize = Math.min(
      pdfChunkSize,
      upload.size - index * pdfChunkSize,
    );
    if (!Buffer.isBuffer(req.body) || req.body.length !== expectedSize)
      return res.status(400).json({ ok: false, message: "分片大小不匹配" });
    if (
      index === 0 &&
      !req.body.subarray(0, 1024).includes(Buffer.from("%PDF-"))
    )
      return res.status(400).json({ ok: false, message: "文件不是有效的 PDF" });
    await fsPromises.writeFile(
      path.join(upload.directory, String(index)),
      req.body,
    );
    upload.received.add(index);
    upload.lastActivityAt = Date.now();
    res.json({
      ok: true,
      received: upload.received.size,
      total: upload.totalChunks,
    });
  },
);

app.post("/api/pdf-uploads/:uploadId/complete", async (req, res) => {
  const upload = pdfUploads.get(req.params.uploadId);
  if (!upload || upload.userId !== req.user.id)
    return res
      .status(404)
      .json({ ok: false, message: "上传任务不存在或已过期" });
  if (upload.status === "completed")
    return res.status(202).json({
      ok: true,
      jobId: upload.jobId,
      status: extractionJobs.get(upload.jobId)?.status || "processing",
    });
  if (upload.status === "assembling")
    return res
      .status(409)
      .json({ ok: false, message: "PDF 正在组装，请勿重复提交" });
  if (upload.received.size !== upload.totalChunks)
    return res.status(409).json({ ok: false, message: "PDF 分片尚未全部上传" });
  if (!extractionCapacityAvailable(req.user.id))
    return res
      .status(503)
      .json({ ok: false, message: "当前识别任务较多，请稍后重试" });
  upload.status = "assembling";
  upload.lastActivityAt = Date.now();

  const assembledPath = path.join(
    os.tmpdir(),
    "ceca-award-imports",
    randomBytes(16).toString("hex"),
  );
  await fsPromises.mkdir(path.dirname(assembledPath), { recursive: true });
  try {
    const output = await fsPromises.open(assembledPath, "w");
    try {
      for (let index = 0; index < upload.totalChunks; index += 1) {
        await output.writeFile(
          await fsPromises.readFile(path.join(upload.directory, String(index))),
        );
      }
    } finally {
      await output.close();
    }
  } catch (error) {
    await fsPromises.unlink(assembledPath).catch(() => {});
    upload.status = "uploading";
    upload.lastActivityAt = Date.now();
    throw error;
  }
  await fsPromises.rm(upload.directory, { recursive: true, force: true });
  const jobId = startExtractionJob(
    {
      path: assembledPath,
      originalname: upload.fileName,
      size: upload.size,
      mimetype: "application/pdf",
    },
    upload.applicationId,
    req.user.id,
  );
  upload.status = "completed";
  upload.jobId = jobId;
  upload.lastActivityAt = Date.now();
  res
    .status(202)
    .json({ ok: true, jobId, status: extractionJobs.get(jobId).status });
});

app.post("/api/extract-pdf", upload.single("file"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ ok: false, message: "请选择 PDF 文件" });
  const applicationId = Number(req.body.applicationId || 0);
  if (applicationId && !ownedApplication(applicationId, req.user.id)) {
    await fsPromises.unlink(req.file.path).catch(() => {});
    return res.status(404).json({ ok: false, message: "申报项目不存在" });
  }
  if (!(await hasPdfHeader(req.file.path))) {
    await fsPromises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ ok: false, message: "文件不是有效的 PDF" });
  }

  if (req.query.async === "1") {
    if (!extractionCapacityAvailable(req.user.id)) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return res
        .status(503)
        .json({ ok: false, message: "当前识别任务较多，请稍后重试" });
    }
    const jobId = startExtractionJob(req.file, applicationId, req.user.id);
    return res
      .status(202)
      .json({ ok: true, jobId, status: extractionJobs.get(jobId).status });
  }

  try {
    const result = await extractAndStorePdf(
      req.file,
      applicationId,
      req.user.id,
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    res
      .status(500)
      .json({ ok: false, message: `PDF 解析失败：${error.message}` });
  } finally {
    if (req.file.path) await fsPromises.unlink(req.file.path).catch(() => {});
  }
});

app.get("/api/extract-pdf/:jobId", (req, res) => {
  const job = extractionJobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.id)
    return res
      .status(404)
      .json({ ok: false, message: "识别任务不存在或已过期" });
  res.json({
    ok: true,
    status: job.status,
    ...(job.result ? { result: job.result } : {}),
    ...(job.message ? { message: job.message } : {}),
  });
});

app.get("/api/health", (_req, res) => {
  const applications = db
    .prepare(
      "SELECT COUNT(*) AS total FROM applications WHERE archived_at IS NULL",
    )
    .get().total;
  const backendSourceModifiedAt = fs.statSync(serverSourcePath).mtime;
  res.json({
    ok: true,
    database: "sqlite",
    applications,
    backendStartedAt: backendStartedAt.toISOString(),
    backendSourceModifiedAt: backendSourceModifiedAt.toISOString(),
    restartRequired:
      backendSourceModifiedAt.getTime() > backendStartedAt.getTime(),
  });
});

const materialsDirectory = path.join(root, "节能奖填报材料");
app.use(
  "/materials",
  express.static(materialsDirectory, {
    setHeaders(res, filePath) {
      res.attachment(path.basename(filePath));
      res.setHeader("Cache-Control", "no-store");
    },
  }),
);
app.use("/materials", (_req, res) => {
  res.status(404).json({ ok: false, message: "申报模板或参考资料不存在" });
});

if (process.argv.includes("--serve")) {
  app.use(express.static(path.join(root, "dist")));
  app.use((_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
}

app.use((error, _req, res, _next) => {
  res.status(400).json({ ok: false, message: error.message || "请求处理失败" });
});

app.listen(port, host, () => {
  console.log(`Award system API ready at http://${host}:${port}`);
});
