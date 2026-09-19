import express from "express";
import fsPromises from "node:fs/promises";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  extractLegacyWordFields,
  extractWordFields,
  WORD_IMPORT_LIMITS,
  WordImportError,
} from "../lib/word-fields.mjs";

function normalizeUploadedName(originalName) {
  const name = String(originalName || "");
  try {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("\ufffd") ? name : decoded;
  } catch {
    return name;
  }
}

export function createWordImportRouter({
  ownsApplication,
  temporaryRoot = path.join(os.tmpdir(), "ceca-award-word-imports"),
  extractFields = extractWordFields,
  extractLegacyFields = extractLegacyWordFields,
}) {
  const router = express.Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (request, _file, callback) =>
        callback(null, request.wordImportTempDir),
      filename: (_request, file, callback) =>
        callback(
          null,
          `${crypto.randomUUID()}${path.extname(normalizeUploadedName(file.originalname)).toLowerCase()}`,
        ),
    }),
    limits: { fileSize: WORD_IMPORT_LIMITS.maxFileBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      const name = normalizeUploadedName(file.originalname).toLowerCase();
      const allowed =
        (name.endsWith(".doc") || name.endsWith(".docx")) &&
        !name.endsWith(".docm");
      callback(
        allowed ? null : new Error("仅支持 .doc 或不含宏的 .docx 文件"),
        allowed,
      );
    },
  });

  router.post(
    "/",
    async (request, response, next) => {
      try {
        await fsPromises.mkdir(temporaryRoot, { recursive: true });
        request.wordImportTempDir = await fsPromises.mkdtemp(
          path.join(temporaryRoot, "request-"),
        );
        let cleanupInFlight = null;
        request.cleanupWordImport = () => {
          if (cleanupInFlight) return cleanupInFlight;
          cleanupInFlight = fsPromises
            .rm(request.wordImportTempDir, {
              recursive: true,
              force: true,
              maxRetries: 3,
              retryDelay: 25,
            })
            .catch(() => {})
            .finally(() => {
              cleanupInFlight = null;
            });
          return cleanupInFlight;
        };
        request.once("aborted", request.cleanupWordImport);
        response.once("close", request.cleanupWordImport);
        if (request.aborted || response.destroyed) {
          await request.cleanupWordImport();
          return;
        }
        next();
      } catch (error) {
        next(error);
      }
    },
    upload.single("file"),
    async (request, response) => {
      const temporaryPath = request.file?.path;
      try {
        if (!request.file)
          return response
            .status(400)
            .json({ ok: false, message: "请选择 .doc 或 .docx 文件" });
        const applicationId = Number(request.body.applicationId || 0);
        if (!Number.isInteger(applicationId) || applicationId <= 0)
          return response
            .status(400)
            .json({ ok: false, message: "申报项目参数无效" });
        if (!ownsApplication(applicationId, request.user.id))
          return response
            .status(404)
            .json({ ok: false, message: "申报项目不存在" });

        const buffer = await fsPromises.readFile(temporaryPath);
        const originalName = normalizeUploadedName(request.file.originalname);
        const extractOptions = {
          sectionKey: String(request.body.sectionKey || ""),
        };
        const result = originalName.toLowerCase().endsWith(".docx")
          ? await extractFields(buffer, originalName, extractOptions)
          : await extractLegacyFields(buffer, originalName, extractOptions);
        return response.json({ ok: true, ...result });
      } catch (error) {
        const status = error instanceof WordImportError ? 422 : 500;
        return response.status(status).json({
          ok: false,
          code: error.code || "word_import_failed",
          message:
            error instanceof WordImportError
              ? error.message
              : `Word 解析失败：${error.message}`,
        });
      } finally {
        await request.cleanupWordImport?.();
      }
    },
  );

  router.use(async (error, request, response, _next) => {
    await request.cleanupWordImport?.();
    if (response.headersSent || response.destroyed) return;
    const isLimit = error?.code === "LIMIT_FILE_SIZE";
    const message = isLimit
      ? "Word 文件大小不能超过 20 MB"
      : error?.message || "Word 文件上传失败";
    response.status(isLimit ? 422 : 400).json({
      ok: false,
      code: isLimit ? "document_too_large" : "word_upload_failed",
      message,
    });
  });

  return router;
}
