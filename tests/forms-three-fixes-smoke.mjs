import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4180";
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await context.newPage();
let applicationId;

try {
  const registration = await context.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username: `threefixes${suffix}`,
      email: `threefixes${suffix}@example.test`,
      displayName: "三项验收用户",
      password: `ThreeFixes-${suffix}`,
    },
  });
  assert.equal(registration.ok(), true, await registration.text());
  const creation = await context.request.post(`${baseUrl}/api/applications`, {
    data: { title: `三项验收-${suffix}`, year: 2026, awardType: "节能减排科技进步奖", workflowMode: "form" },
  });
  const body = await creation.json();
  assert.equal(creation.ok(), true);
  applicationId = body.application.id;
  await context.request.put(`${baseUrl}/api/applications/${applicationId}`, {
    data: { data: { projectName: body.application.title, awardRecords: [{ name: "节能成果", award: "创新奖" }] } },
  });

  await page.goto(baseUrl);
  await page.getByRole("button", { name: body.application.title, exact: true }).click();
  await page.getByRole("button", { name: /曾获奖励情况/ }).click();
  await page.getByText("填写获奖项目的完整名称，限200字").waitFor();
  const pinned = await page.locator(".structured-table__scroll").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    const viewport = element.getBoundingClientRect();
    const start = element.querySelector(".structured-table__row .structured-table__sticky-start").getBoundingClientRect();
    const end = element.querySelector(".structured-table__row .structured-table__sticky-end").getBoundingClientRect();
    return { scrolled: element.scrollLeft > 0, start: start.left >= viewport.left - 1, end: end.right <= viewport.right + 1, measurements: { viewportLeft: viewport.left, startLeft: start.left, startPosition: getComputedStyle(element.querySelector(".structured-table__row .structured-table__sticky-start")).position } };
  });
  assert.equal(pinned.scrolled, true, JSON.stringify(pinned));
  assert.equal(pinned.start, true, JSON.stringify(pinned));
  assert.equal(pinned.end, true, JSON.stringify(pinned));
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  console.log(JSON.stringify({ guidance: true, pinnedColumns: true, narrowViewportOverflow: false }));
} finally {
  if (applicationId) await context.request.delete(`${baseUrl}/api/applications/${applicationId}`);
  await browser.close();
}