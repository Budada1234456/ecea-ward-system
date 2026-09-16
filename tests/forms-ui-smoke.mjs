import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4180";
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  chromium.executablePath(),
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => candidate && existsSync(candidate));
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const username = `formtest${suffix}`;
const password = `FormTest-${suffix}`;
const title = `表单组件验收项目-${suffix}`;
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(5_000);
const errors = [];
let applicationId;
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

async function expectVisible(locator) {
  await locator.waitFor({ state: "visible" });
}

try {
  const registerResponse = await context.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        username,
        email: `${username}@example.test`,
        displayName: "表单验收用户",
        password,
      },
    },
  );
  assert.equal(registerResponse.ok(), true, await registerResponse.text());

  const createResponse = await context.request.post(
    `${baseUrl}/api/applications`,
    {
      data: {
        title,
        year: 2026,
        awardType: "节能减排科技进步奖",
        workflowMode: "form",
      },
    },
  );
  const createBody = await createResponse.text();
  assert.equal(createResponse.ok(), true, createBody);
  applicationId = JSON.parse(createBody).application.id;

  const seedResponse = await context.request.put(
    `${baseUrl}/api/applications/${applicationId}`,
    {
      data: {
        data: {
          projectName: title,
          ipRecords: [{ name: "旧数据专利", number: "CN-LEGACY-1" }],
          people: [
            { id: "person-a", name: "甲完成人", contribution: "贡献甲" },
            { id: "person-b", name: "乙完成人", contribution: "贡献乙" },
          ],
          units: [{ id: "unit-a", name: "甲完成单位", contribution: "贡献" }],
        },
      },
    },
  );
  assert.equal(seedResponse.ok(), true, await seedResponse.text());

  await page.goto(baseUrl);
  await expectVisible(page.getByRole("heading", { name: "我的申报项目" }));
  await page.getByRole("button", { name: title, exact: true }).click();

  await page.getByRole("combobox", { name: "检索学科" }).focus();
  await expectVisible(page.getByRole("option", { name: /能源科学技术.*480/ }));
  await page
    .getByRole("button", { name: "展开能源科学技术的下级学科" })
    .click();
  const disciplinePath = page.getByRole("navigation", { name: "学科层级路径" });
  await expectVisible(disciplinePath);
  assert.match(await disciplinePath.innerText(), /能源科学技术/);
  await expectVisible(page.getByRole("option", { name: /能源化学/ }));

  await page.getByRole("button", { name: /知识产权情况/ }).click();
  assert.equal(
    await page.getByLabel("授权号").first().inputValue(),
    "CN-LEGACY-1",
  );
  await page.getByRole("button", { name: "添加记录" }).click();
  const names = page.getByLabel("授权（申请）项目名称");
  assert.equal(await names.count(), 2);
  await names.nth(1).focus();
  await names.nth(1).blur();
  await expectVisible(page.getByText("请填写授权（申请）项目名称"));
  await names.nth(1).fill("新增专利");

  await page.getByRole("button", { name: /主要完成人/ }).click();
  const peopleList = page.getByLabel("完成人列表");
  await peopleList.getByRole("button", { name: /乙完成人/ }).click();
  await page.getByRole("button", { name: "上移乙完成人" }).click();
  assert.match(
    await peopleList.locator("button").first().innerText(),
    /乙完成人/,
  );
  assert.equal(await page.getByLabel("排名").inputValue(), "1");
  let savedPeople = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await context.request.get(
      `${baseUrl}/api/applications/${applicationId}`,
    );
    const payload = await response.json();
    savedPeople = payload.application.data.people || [];
    if (savedPeople[0]?.name === "乙完成人" && savedPeople[0]?.rank === 1)
      break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.deepEqual(
    savedPeople.map(({ name, rank }) => ({ name, rank })),
    [
      { name: "乙完成人", rank: 1 },
      { name: "甲完成人", rank: 2 },
    ],
  );

  await page.screenshot({
    path: "test-results/forms-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: /知识产权情况/ }).click();
  await page.waitForFunction(
    () => !document.querySelector(".sidebar")?.classList.contains("open"),
  );
  await page.waitForTimeout(350);
  const pageOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  assert.equal(pageOverflow, false, "mobile page has horizontal overflow");
  await expectVisible(page.locator(".structured-table__row").first());
  await page.screenshot({
    path: "test-results/forms-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log("Forms UI smoke test passed at desktop and mobile viewports.");
} finally {
  if (applicationId) {
    await context.request.delete(
      `${baseUrl}/api/applications/${applicationId}`,
    );
  }
  await browser.close();
}
