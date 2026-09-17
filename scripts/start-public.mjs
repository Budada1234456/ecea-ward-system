import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4174);
const localUrl = `http://127.0.0.1:${port}`;
const publicUrlFile = path.join(root, "data", "public-url.txt");
const children = new Set();
let stopping = false;
const publicHealthIntervalMs = 60_000;
const publicHealthFailureLimit = 5;

function launch(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`${label} 启动失败：${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${label} 意外退出（${signal || code}）`);
      stop(code || 1);
    }
  });
  return child;
}

function forwardLines(stream, label, onLine) {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (line.trim()) console.log(`[${label}] ${line}`);
    Promise.resolve(onLine?.(line)).catch((error) => {
      console.error(`${label} 输出处理失败：${error.message}`);
      stop(1);
    });
  });
}

async function waitForApplication() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${localUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The application may still be initializing.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("应用在 30 秒内未能启动");
}

function waitForCloudflareUrl(tunnel) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let assignedUrl = "";
    let connected = false;
    const finishWhenReady = () => {
      if (!settled && assignedUrl && connected) {
        settled = true;
        clearTimeout(timeout);
        resolve(assignedUrl);
      }
    };
    const inspectLine = (line) => {
      const publicUrl = line.match(
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
      )?.[0];
      if (publicUrl) assignedUrl = publicUrl;
      if (line.includes("Registered tunnel connection")) connected = true;
      finishWhenReady();
    };
    forwardLines(tunnel.stdout, "cloudflared", inspectLine);
    forwardLines(tunnel.stderr, "cloudflared", inspectLine);
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Cloudflare 在 45 秒内未完成公网隧道连接"));
      }
    }, 45_000);
  });
}

async function publicApplicationIsHealthy(publicUrl) {
  const response = await fetch(`${publicUrl}/api/health`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null);
  return payload?.ok === true;
}

async function waitForPublicApplication(publicUrl) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if (await publicApplicationIsHealthy(publicUrl)) return;
    } catch {
      // A new quick-tunnel hostname can take a few seconds to propagate.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("公网地址在 60 秒内未能通过健康检查");
}

function monitorPublicApplication(publicUrl) {
  let consecutiveFailures = 0;
  let checking = false;
  setInterval(async () => {
    if (checking || stopping) return;
    checking = true;
    try {
      const healthy = await publicApplicationIsHealthy(publicUrl);
      consecutiveFailures = healthy ? 0 : consecutiveFailures + 1;
    } catch (error) {
      consecutiveFailures += 1;
      console.warn(
        `公网健康检查失败（${consecutiveFailures}/${publicHealthFailureLimit}）：${error.message}`,
      );
    } finally {
      checking = false;
    }
    if (consecutiveFailures >= publicHealthFailureLimit) {
      console.error("公网隧道持续不可用，正在重建连接");
      stop(1);
    }
  }, publicHealthIntervalMs);
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(exitCode);
  }, 5_000);
  timer.unref();
  Promise.all(
    [...children].map(
      (child) => new Promise((resolve) => child.once("exit", resolve)),
    ),
  ).finally(() => process.exit(exitCode));
}

async function main() {
  await fs.rm(publicUrlFile, { force: true });

  const application = launch(
    process.execPath,
    [
      path.join(root, "server.mjs"),
      "--serve",
      "--host=127.0.0.1",
      `--port=${port}`,
    ],
    "application",
  );
  forwardLines(application.stdout, "application");
  forwardLines(application.stderr, "application");
  await waitForApplication();

  const tunnel = launch(
    process.env.CLOUDFLARED_BIN || "cloudflared",
    ["tunnel", "--no-autoupdate", "--protocol", "quic", "--url", localUrl],
    "cloudflared",
  );
  const publicUrl = await waitForCloudflareUrl(tunnel);
  await waitForPublicApplication(publicUrl);
  await fs.writeFile(publicUrlFile, `${publicUrl}\n`, { mode: 0o600 });
  console.log(`\n公网访问地址：${publicUrl}\n`);
  monitorPublicApplication(publicUrl);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
process.on("uncaughtException", (error) => {
  console.error(error);
  stop(1);
});
process.on("unhandledRejection", (error) => {
  console.error(error);
  stop(1);
});

main().catch((error) => {
  console.error(error.message);
  stop(1);
});
