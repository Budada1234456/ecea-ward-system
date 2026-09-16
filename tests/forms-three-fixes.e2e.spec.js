import { expect, test } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4180";

test("field guidance and pinned table columns work at desktop and narrow widths", async ({ page }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `threefixes${suffix}`;
  const title = `三项验收-${suffix}`;
  let applicationId;

  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "三项验收用户",
      password: `ThreeFixes-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  const creation = await page.request.post(`${baseUrl}/api/applications`, {
    data: { title, year: 2026, awardType: "节能减排科技进步奖", workflowMode: "form" },
  });
  const creationBody = await creation.json();
  expect(creation.ok()).toBe(true);
  applicationId = creationBody.application.id;

  try {
    await page.request.put(`${baseUrl}/api/applications/${applicationId}`, {
      data: {
        data: {
          projectName: title,
          disciplines: [
            { code: "4806010", name: "煤炭能", status: "confirmed", path: ["480", "48060", "4806010"] },
          ],
          awardRecords: [{ name: "节能成果", date: "2026-01-01", award: "创新奖", level: "一等奖", org: "中国节能协会" }],
        },
      },
    });

    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(baseUrl);
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: /曾获奖励情况/ }).click();
    await expect(page.getByText("填写获奖项目的完整名称，限200字")).toBeVisible();

    const scroll = page.locator(".structured-table__scroll");
    const pinned = await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      const viewport = element.getBoundingClientRect();
      const start = element.querySelector(".structured-table__row .structured-table__sticky-start").getBoundingClientRect();
      const end = element.querySelector(".structured-table__row .structured-table__sticky-end").getBoundingClientRect();
      return {
        scrolled: element.scrollLeft > 0,
        startVisible: start.left >= viewport.left - 1,
        endVisible: end.right <= viewport.right + 1,
      };
    });
    expect(pinned).toEqual({ scrolled: true, startVisible: true, endVisible: true });

    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByText("填写获奖项目的完整名称，限200字")).toBeVisible();
  } finally {
    if (applicationId) await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
  }
});