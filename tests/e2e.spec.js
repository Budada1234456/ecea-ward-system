import { test, expect } from "@playwright/test";
import path from "node:path";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
test.skip(!adminPassword, "需要通过 TEST_ADMIN_PASSWORD 提供管理员测试密码");
const projectTitle = `浏览器验收项目-${Date.now()}`;
const samplePdf = path.resolve(
  "节能奖填报材料",
  "附件3.中国节能协会创新奖申报书填写说明-1.pdf",
);
const completedApplicationPdf = path.resolve(
  "节能奖填报材料",
  "中国节能协会创新奖申报书-规模化分布式光伏安全灵活接入与节能运行控制技术及应用.pdf",
);

async function loginAsAdmin(page) {
  await page.goto(baseUrl);
  await page.getByLabel("账号或邮箱").fill("admin");
  await page.getByLabel("密码").fill(adminPassword);
  await page.getByRole("button", { name: "账号登录" }).click();
}

test("project center, attachment workflow and PDF export", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  let applicationId;

  try {
    await request.post(`${baseUrl}/api/auth/login`, {
      data: { account: "admin", password: adminPassword },
    });
    await loginAsAdmin(page);
    await expect(
      page.getByRole("heading", { name: "我的申报项目" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "公告中心" }).click();
    await expect(
      page.getByRole("heading", { name: "2026 年度申报工作通知" }),
    ).toBeVisible();
    await expect(page.getByText("2026.07.31 17:00")).toBeVisible();

    await page.getByRole("button", { name: "常见问题" }).click();
    await expect(page.getByRole("heading", { name: "常见问题" })).toBeVisible();
    await expect(
      page.getByText("截止时间为 2026 年 7 月 31 日 17:00。", { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "参考资料" }).click();
    await expect(page.getByRole("heading", { name: "参考资料" })).toBeVisible();
    await expect(page.getByText("2026 年度申报材料包")).toBeVisible();
    const materialResponse = await request.get(
      `${baseUrl}/materials/${encodeURIComponent("附件1.中国节能协会创新奖奖励办法（2026修订版）-1.pdf")}`,
    );
    expect(materialResponse.ok()).toBe(true);
    expect(materialResponse.headers()["content-type"]).toContain(
      "application/pdf",
    );

    await page.getByRole("button", { name: "申报项目中心" }).click();
    await page.getByRole("button", { name: "新建申报材料" }).click();
    const dialog = page.locator(".create-dialog");
    await dialog
      .locator(".award-choice", { hasText: "节能减排技术发明奖" })
      .click();
    await dialog
      .locator("select")
      .nth(1)
      .selectOption("节能减排领域相关企事业单位推荐");
    await dialog.locator("input.control").fill("浏览器验收单位");
    await dialog.locator("textarea").fill(projectTitle);
    const creationResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/applications" &&
        response.request().method() === "POST",
      { timeout: 90_000 },
    );
    await dialog.getByRole("button", { name: "创建申报材料" }).click();
    const creationResponse = await creationResponsePromise;
    expect(creationResponse.ok(), await creationResponse.text()).toBe(true);

    await expect(
      page.getByText(projectTitle, { exact: true }).first(),
    ).toBeVisible();
    const created = await request.get(
      `${baseUrl}/api/applications?keyword=${encodeURIComponent(projectTitle)}`,
    );
    const createdPayload = await created.json();
    applicationId = createdPayload.list[0].id;
    const detail = await request.get(
      `${baseUrl}/api/applications/${applicationId}`,
    );
    const detailPayload = await detail.json();
    expect(detailPayload.application.data.awardType).toBe("节能减排技术发明奖");
    expect(detailPayload.application.data.applicationMode).toBe("project");
    expect(detailPayload.application.data.applicationChannel).toBe(
      "节能减排领域相关企事业单位推荐",
    );
    expect(detailPayload.application.data.applicantUnit).toBe("浏览器验收单位");

    const englishName = `Browser Back Autosave ${Date.now()}`;
    await page.locator("textarea.textarea--compact").first().fill(englishName);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "我的申报项目" }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const saved = await request.get(
          `${baseUrl}/api/applications/${applicationId}`,
        );
        return (await saved.json()).application?.data?.projectNameEn;
      })
      .toBe(englishName);
    await page.getByRole("button", { name: projectTitle, exact: true }).click();
    await expect(
      page.locator("textarea.textarea--compact").first(),
    ).toHaveValue(englishName);

    const disciplineInput = page.getByRole("combobox", { name: "检索学科" });
    const disciplineResults = page.getByRole("listbox");
    await disciplineInput.focus();
    await expect(disciplineResults).toBeVisible();
    await expect(
      page.getByText("请选择终端二级学科或三级学科", { exact: false }),
    ).toBeVisible();
    await expect(
      disciplineResults.getByRole("option", { name: /能源科学技术.*480/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "展开能源科学技术的下级学科" })
      .click();
    await expect(
      page.getByRole("navigation", { name: "学科层级路径" }),
    ).toContainText("能源科学技术");
    await page.getByRole("button", { name: "展开一次能源的下级学科" }).click();
    const terminalDiscipline = disciplineResults.getByRole("option", {
      name: /煤炭能.*4806010/,
    });
    await expect(terminalDiscipline).toBeVisible();
    await terminalDiscipline.click();
    await expect(disciplineResults).toBeHidden();
    await expect(page.getByRole("list", { name: "已选学科" })).toContainText(
      "能源科学技术（480） / 一次能源（48060） / 煤炭能（4806010）",
    );

    await disciplineInput.focus();
    await expect(disciplineResults).toBeVisible();
    await page.locator(".discipline-selector__selection li").click();
    await expect(disciplineResults).toBeVisible();
    await page.getByRole("heading", { name: "项目基本情况" }).click();
    await expect(disciplineResults).toBeHidden();

    await disciplineInput.focus();
    await expect(disciplineResults).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(disciplineResults).toBeHidden();

    await page.getByRole("button", { name: "PDF 智能导入" }).click();
    const importDialog = page.locator(".import-dialog");
    const extractionResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/complete") &&
        response.request().method() === "POST",
      { timeout: 90_000 },
    );
    await importDialog
      .locator('input[type="file"]')
      .setInputFiles(completedApplicationPdf);
    const extractionResponse = await extractionResponsePromise;
    expect(extractionResponse.ok(), await extractionResponse.text()).toBe(true);
    await expect(
      importDialog.getByText("李建威", { exact: false }),
    ).toBeVisible({ timeout: 300_000 });
    await expect(
      importDialog.getByText("已分析 352 / 352 页", { exact: false }),
    ).toBeVisible();
    await importDialog.getByRole("button", { name: "取消" }).click();

    await page.getByRole("button", { name: /附件目录/ }).click();
    await expect(page.getByRole("heading", { name: "附件目录" })).toBeVisible();
    await expect(page.getByText("最终签章合并版已保留")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "导出最终版 PDF" }),
    ).toBeVisible();
    await page
      .locator('.attachment-row-wrap input[type="file"]')
      .first()
      .setInputFiles(samplePdf);
    await expect(
      page.getByText("附件3.中国节能协会创新奖申报书填写说明-1.pdf"),
    ).toBeVisible();

    let validationMessage = "";
    page.once("dialog", async (browserDialog) => {
      validationMessage = browserDialog.message();
      await browserDialog.accept();
    });
    await page.getByRole("button", { name: "提交形式审查" }).click();
    await expect.poll(() => validationMessage).toContain("提交前请完善");

    await page.getByRole("button", { name: "预览当前申报书" }).click();
    await expect(
      page.getByRole("button", { name: "导出系统生成 PDF" }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出系统生成 PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  } finally {
    if (applicationId) {
      const filesResponse = await request.get(
        `${baseUrl}/api/applications/${applicationId}/files`,
      );
      const filesPayload = await filesResponse.json();
      for (const file of filesPayload.list || []) {
        await request.delete(
          `${baseUrl}/api/applications/${applicationId}/files/${file.id}`,
        );
      }
      await request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});

test("mobile portal navigation remains accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await expect(page.getByRole("button", { name: "公告中心" })).toBeVisible();
  await page.getByRole("button", { name: "公告中心" }).click();
  await expect(
    page.getByRole("heading", { name: "2026 年度申报工作通知" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "常见问题" }).click();
  await expect(page.getByRole("heading", { name: "常见问题" })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
