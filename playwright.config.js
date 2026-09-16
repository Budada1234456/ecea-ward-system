import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const browserExecutable = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));

export default {
  testDir: "./tests",
  testMatch: ["e2e.spec.js", "**/*.e2e.spec.js"],
  globalTeardown: "./tests/cleanup-e2e.mjs",
  timeout: 60_000,
  use: {
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    launchOptions: browserExecutable
      ? { executablePath: browserExecutable }
      : {},
  },
};
