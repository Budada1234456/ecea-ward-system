import { expect, test } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

test("field guidance and pinned table columns work at desktop and narrow widths", async ({
  page,
}) => {
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
    data: {
      title,
      year: 2026,
      awardType: "节能减排科技进步奖",
      workflowMode: "form",
    },
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
            {
              code: "4806010",
              name: "煤炭能",
              status: "confirmed",
              path: ["480", "48060", "4806010"],
            },
          ],
          awardRecords: [
            {
              name: "节能成果",
              date: "2026-01-01",
              award: "创新奖",
              level: "一等奖",
              org: "中国节能协会",
            },
          ],
          ipRecords: [
            {
              id: "ip-confirmation-record",
              name: "待确认删除的知识产权",
              type: "发明专利",
            },
          ],
        },
      },
    });

    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(baseUrl);
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: /曾获奖励情况/ }).click();
    await expect(
      page.getByText("填写获奖项目的完整名称，限200字"),
    ).toBeVisible();

    await page.getByRole("button", { name: /知识产权情况/ }).click();
    await page.getByRole("button", { name: "删除第1条记录" }).click();
    const confirmation = page.getByRole("alertdialog", { name: "确认删除" });
    await expect(confirmation).toContainText("待确认删除的知识产权");
    await confirmation.getByRole("button", { name: "取消" }).click();
    const ipName = page.locator(".records-collection textarea").first();
    await expect(ipName).toHaveValue("待确认删除的知识产权");

    await page.getByRole("button", { name: "删除第1条记录" }).click();
    await confirmation.getByRole("button", { name: "确认删除" }).click();
    await expect(ipName).toHaveCount(0);

    await page.getByRole("button", { name: /曾获奖励情况/ }).click();

    const scroll = page.locator(".structured-table__scroll");
    const pinned = await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      const viewport = element.getBoundingClientRect();
      const start = element
        .querySelector(".structured-table__row .structured-table__sticky-start")
        .getBoundingClientRect();
      const end = element
        .querySelector(".structured-table__row .structured-table__sticky-end")
        .getBoundingClientRect();
      return {
        scrolled: element.scrollLeft > 0,
        startVisible: start.left >= viewport.left - 1,
        endVisible: end.right <= viewport.right + 1,
      };
    });
    expect(pinned).toEqual({
      scrolled: true,
      startVisible: true,
      endVisible: true,
    });

    await page.getByRole("button", { name: /项目详细内容/ }).click();
    const richEditor = page.locator(".rich-editor").first();
    const zoomControls = richEditor.getByLabel("编辑器视图缩放");
    await expect(zoomControls).toContainText("100%");
    await richEditor.locator(".rich-editor-canvas").dispatchEvent("wheel", {
      deltaY: -120,
      ctrlKey: true,
    });
    await expect(zoomControls).toContainText("110%");

    await page.getByRole("button", { name: /曾获奖励情况/ }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByText("填写获奖项目的完整名称，限200字"),
    ).toBeVisible();

    await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name: /项目简介/ }).click();
    let nextValidationMessage = "";
    page.once("dialog", async (dialog) => {
      nextValidationMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: "保存并进入下一项" }).click();
    await expect.poll(() => nextValidationMessage).toContain("本页尚未完成");
    await expect(page.getByRole("heading", { name: "项目简介" })).toBeVisible();

    let previewValidationMessage = "";
    page.once("dialog", async (dialog) => {
      previewValidationMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: "预览当前申报书" }).click();
    await expect
      .poll(() => previewValidationMessage)
      .toContain("生成预览前请完善");
    await expect(page.getByText("申报书预览", { exact: true })).toHaveCount(0);
  } finally {
    if (applicationId)
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
  }
});
