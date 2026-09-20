import { expect, test } from "@playwright/test";
import { jsPDF } from "jspdf";
import {
  completePerson,
  completeProjectData,
  completeUnit,
} from "./application-fixtures.mjs";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==",
  "base64",
);
const requiredProjectMaterials = [
  "technical_proof",
  "application_proof",
  "evaluation_report",
  "novelty_report",
  "patent_proof",
  "inventor_id",
  "unit_license",
];

function createPdf(pageCount) {
  const document = new jsPDF();
  document.text("Award material", 20, 20);
  for (let page = 1; page < pageCount; page += 1) document.addPage();
  return Buffer.from(document.output("arraybuffer"));
}

test("each award loads its own form, validation and preview profile", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `awardprofiles${suffix}`;
  const applications = [];
  const longPdf = createPdf(41);

  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "奖项分流验收用户",
      password: `AwardProfiles-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  const create = async (awardType, title, workflowMode = "form") => {
    const response = await page.request.post(`${baseUrl}/api/applications`, {
      data: {
        awardType,
        title,
        applicantUnit: "中国节能测试单位",
        year: 2026,
        workflowMode,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const application = (await response.json()).application;
    applications.push(application.id);
    return application;
  };
  const uploadMaterial = async (
    applicationId,
    category,
    file = { name: `${category}.png`, mimeType: "image/png", buffer: tinyPng },
  ) => {
    const response = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      { multipart: { category, file } },
    );
    return response;
  };
  const uploadSourcePdf = (applicationId, buffer) =>
    page.request.post(`${baseUrl}/api/extract-pdf`, {
      multipart: {
        applicationId: String(applicationId),
        file: {
          name: "complete-signed-application.pdf",
          mimeType: "application/pdf",
          buffer,
        },
      },
      timeout: 120_000,
    });

  const achievementTitle = `科技成就候选人-${suffix}`;
  const progressTitle = `科技进步项目-${suffix}`;
  const inventionTitle = `技术发明项目-${suffix}`;
  const documentTitle = `完整签章项目-${suffix}`;

  try {
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "新建申报材料" }).click();
    const createDialog = page.locator(".create-dialog");
    await expect(
      createDialog.getByText("导入完整材料", { exact: true }),
    ).toHaveCount(0);
    await createDialog
      .locator(".award-choice", { hasText: "节能减排科技成就奖" })
      .click();
    await expect(
      createDialog.getByText("导入完整材料", { exact: true }),
    ).toHaveCount(0);
    await expect(
      createDialog.getByText("候选人姓名", { exact: true }),
    ).toBeVisible();
    await createDialog.getByRole("button", { name: "取消" }).click();

    const invalidAward = await page.request.post(
      `${baseUrl}/api/applications`,
      {
        data: {
          awardType: "不存在的奖项",
          title: `无效奖项-${suffix}`,
          applicantUnit: "测试单位",
        },
      },
    );
    expect(invalidAward.status()).toBe(422);

    const achievement = await create("节能减排科技成就奖", achievementTitle);
    const progress = await create("节能减排科技进步奖", progressTitle);
    const invention = await create("节能减排技术发明奖", inventionTitle);
    const documentProgress = await create(
      "节能减排科技进步奖",
      documentTitle,
      "document",
    );

    const incompleteSubmit = await page.request.post(
      `${baseUrl}/api/applications/${achievement.id}/submit`,
    );
    expect(incompleteSubmit.status()).toBe(422);
    const incomplete = await incompleteSubmit.json();
    expect(incomplete.missing).toContain("候选人工作单位");
    expect(incomplete.missing).toContain("科技成果转化及推广");
    expect(incomplete.missing).toContain("节能减排相关工作总结");
    expect(incomplete.missing).toContain("科技奖励和荣誉证明");
    expect(incomplete.missing).toContain("代表性论文或专著");
    expect(incomplete.missing).toContain("知识产权证明");
    expect(incomplete.missing).toContain("科研项目证明");
    expect(incomplete.missing).toContain("效益证明");
    expect(incomplete.missing).not.toContain("主要完成人");
    expect(incomplete.missing).not.toContain("主要完成单位");

    const lockedUpdate = await page.request.put(
      `${baseUrl}/api/applications/${achievement.id}`,
      {
        data: {
          data: {
            awardType: "节能减排技术发明奖",
            projectName: achievementTitle,
            applicantUnit: "中国节能测试单位",
            candidate: {
              birthDate: "1960-01-01",
              workUnit: "中国节能测试单位",
            },
            transformation:
              '<img src="/api/content-image.png" alt="成果转化说明">',
            workSummary: "候选人长期从事节能减排科技工作。",
            awardRecords: Array.from({ length: 11 }, (_, index) => ({
              name: `代表性奖励 ${index + 1}`,
              award: "节能科技奖励",
            })),
          },
        },
      },
    );
    expect(lockedUpdate.ok(), await lockedUpdate.text()).toBe(true);
    const lockedBody = await lockedUpdate.json();
    expect(lockedBody.application.award_type).toBe("节能减排科技成就奖");
    expect(lockedBody.application.data.applicationMode).toBe("individual");
    expect(lockedBody.application.data.profileCode).toBe("achievement");

    const overAgeSubmit = await page.request.post(
      `${baseUrl}/api/applications/${achievement.id}/submit`,
    );
    expect(overAgeSubmit.status()).toBe(422);
    expect((await overAgeSubmit.json()).missing).toContain(
      "候选人申报年末年龄须在 60 周岁及以下",
    );

    for (let index = 0; index < 20; index += 1) {
      const upload = await uploadMaterial(achievement.id, "achievement_other");
      expect(upload.ok(), await upload.text()).toBe(true);
    }
    const extraOptionalMaterial = await uploadMaterial(
      achievement.id,
      "achievement_other",
    );
    expect(extraOptionalMaterial.status()).toBe(422);
    expect((await extraOptionalMaterial.json()).message).toContain(
      "不得超过 20 个文件",
    );
    const optionalOnlySubmit = await page.request.post(
      `${baseUrl}/api/applications/${achievement.id}/submit`,
    );
    expect(optionalOnlySubmit.status()).toBe(422);
    expect((await optionalOnlySubmit.json()).missing).toContain(
      "科技奖励和荣誉证明",
    );

    for (const category of [
      "achievement_honors",
      "achievement_ip",
      "achievement_research",
    ]) {
      const upload = await uploadMaterial(achievement.id, category);
      expect(upload.ok(), await upload.text()).toBe(true);
    }
    for (let index = 0; index < 5; index += 1) {
      const upload = await uploadMaterial(
        achievement.id,
        "achievement_publications",
      );
      expect(upload.ok(), await upload.text()).toBe(true);
    }
    const extraPaper = await uploadMaterial(
      achievement.id,
      "achievement_publications",
    );
    expect(extraPaper.status()).toBe(422);
    expect((await extraPaper.json()).message).toContain("不得超过 5 个文件");
    const longAchievementPdf = await uploadMaterial(
      achievement.id,
      "achievement_benefits",
      {
        name: "achievement-41-pages.pdf",
        mimeType: "application/pdf",
        buffer: longPdf,
      },
    );
    expect(longAchievementPdf.ok(), await longAchievementPdf.text()).toBe(true);

    const correctedAge = await page.request.put(
      `${baseUrl}/api/applications/${achievement.id}`,
      {
        data: {
          data: {
            candidate: {
              birthDate: "1980-01-01",
              workUnit: "中国节能测试单位",
            },
          },
        },
      },
    );
    expect(correctedAge.ok(), await correctedAge.text()).toBe(true);

    const achievementSubmit = await page.request.post(
      `${baseUrl}/api/applications/${achievement.id}/submit`,
    );
    expect(achievementSubmit.ok(), await achievementSubmit.text()).toBe(true);

    const seedProject = async (
      application,
      startDate,
      endDate,
      uploadSeparateMaterials = true,
    ) => {
      const response = await page.request.put(
        `${baseUrl}/api/applications/${application.id}`,
        {
          data: {
            data: completeProjectData(application.title, {
              applicationUnits: [
                {
                  unitName: "示范应用单位",
                  startDate,
                  endDate,
                },
              ],
            }),
          },
        },
      );
      expect(response.ok(), await response.text()).toBe(true);
      if (uploadSeparateMaterials) {
        for (const category of requiredProjectMaterials) {
          const upload = await uploadMaterial(application.id, category);
          expect(upload.ok(), await upload.text()).toBe(true);
        }
      }
    };

    await seedProject(progress, "2025-10", "2026-09", false);
    const shortProgressSubmit = await page.request.post(
      `${baseUrl}/api/applications/${progress.id}/submit`,
    );
    expect(shortProgressSubmit.status()).toBe(422);
    expect((await shortProgressSubmit.json()).missing).toContain(
      "至少一家应用单位的实际应用时间须满 1 年",
    );
    const oversizedProjectPdf = await uploadMaterial(progress.id, "other", {
      name: "project-41-pages.pdf",
      mimeType: "application/pdf",
      buffer: longPdf,
    });
    expect(oversizedProjectPdf.status()).toBe(422);
    expect((await oversizedProjectPdf.json()).message).toContain(
      "附件总页数不得超过 40 页",
    );
    const invalidEndDate = await page.request.put(
      `${baseUrl}/api/applications/${progress.id}`,
      {
        data: {
          data: {
            applicationUnits: [
              {
                unitName: "示范应用单位",
                startDate: "2025-01",
                endDate: "非法日期",
              },
            ],
          },
        },
      },
    );
    expect(invalidEndDate.ok(), await invalidEndDate.text()).toBe(true);
    const invalidDateSubmit = await page.request.post(
      `${baseUrl}/api/applications/${progress.id}/submit`,
    );
    expect(invalidDateSubmit.status()).toBe(422);
    expect((await invalidDateSubmit.json()).missing).toContain(
      "至少一家应用单位的实际应用时间须满 1 年",
    );
    const blankEntities = await page.request.put(
      `${baseUrl}/api/applications/${progress.id}`,
      { data: { data: { people: [{}], units: [{}] } } },
    );
    expect(blankEntities.ok(), await blankEntities.text()).toBe(true);
    const blankEntitiesSubmit = await page.request.post(
      `${baseUrl}/api/applications/${progress.id}/submit`,
    );
    const blankEntityErrors = (await blankEntitiesSubmit.json()).missing;
    expect(blankEntityErrors).toContain("主要完成人");
    expect(blankEntityErrors).toContain("主要完成单位");
    const validProgress = await page.request.put(
      `${baseUrl}/api/applications/${progress.id}`,
      {
        data: {
          data: {
            people: [completePerson()],
            units: [completeUnit()],
            applicationUnits: [
              {
                unitName: "示范应用单位",
                startDate: "2025-08",
                endDate: "2026-09",
              },
            ],
          },
        },
      },
    );
    expect(validProgress.ok(), await validProgress.text()).toBe(true);
    const missingProjectFiles = await page.request.post(
      `${baseUrl}/api/applications/${progress.id}/submit`,
    );
    const missingProjectFileErrors = (await missingProjectFiles.json()).missing;
    expect(missingProjectFileErrors).toEqual(
      expect.arrayContaining([
        "1. 技术证明材料",
        "2. 应用证明",
        "3. 科技成果评价报告",
        "4. 科技查新报告",
        "5. 国家发明专利证明",
        "6. 主要完成人身份证",
        "7. 主要完成单位营业执照",
      ]),
    );
    for (const category of requiredProjectMaterials) {
      const upload = await uploadMaterial(progress.id, category);
      expect(upload.ok(), await upload.text()).toBe(true);
    }
    const progressSubmit = await page.request.post(
      `${baseUrl}/api/applications/${progress.id}/submit`,
    );
    expect(progressSubmit.ok(), await progressSubmit.text()).toBe(true);

    await seedProject(invention, "2024-10", "2026-09");
    const shortInventionSubmit = await page.request.post(
      `${baseUrl}/api/applications/${invention.id}/submit`,
    );
    expect(shortInventionSubmit.status()).toBe(422);
    expect((await shortInventionSubmit.json()).missing).toContain(
      "至少一家应用单位的实际应用时间须满 2 年",
    );
    const validInvention = await page.request.put(
      `${baseUrl}/api/applications/${invention.id}`,
      {
        data: {
          data: {
            applicationUnits: [
              {
                unitName: "示范应用单位",
                startDate: "2024-08",
                endDate: "2026-09",
              },
            ],
          },
        },
      },
    );
    expect(validInvention.ok(), await validInvention.text()).toBe(true);
    const inventionSubmit = await page.request.post(
      `${baseUrl}/api/applications/${invention.id}/submit`,
    );
    expect(inventionSubmit.ok(), await inventionSubmit.text()).toBe(true);

    await seedProject(documentProgress, "2025-08", "2026-09", false);
    const forgedSource = await uploadMaterial(
      documentProgress.id,
      "source_pdf",
    );
    expect(forgedSource.status()).toBe(422);
    expect((await forgedSource.json()).message).toBe("附件类别无效");
    const sourceUpload = await uploadSourcePdf(documentProgress.id, longPdf);
    expect(sourceUpload.ok(), await sourceUpload.text()).toBe(true);
    const documentSubmit = await page.request.post(
      `${baseUrl}/api/applications/${documentProgress.id}/submit`,
    );
    expect(documentSubmit.ok(), await documentSubmit.text()).toBe(true);

    await page.goto(baseUrl);
    await page
      .getByRole("button", { name: achievementTitle, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "基本情况" })).toBeVisible();
    await expect(page.getByText("奖项在创建后锁定")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /所获科技奖励和荣誉称号情况/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /承担科研项目/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /主要完成单位/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "PDF 智能导入" }),
    ).toHaveCount(0);
    const achievementChapterNav = page.locator(".sidebar nav button");
    for (const chapterIndex of [4, 5, 6]) {
      await achievementChapterNav.nth(chapterIndex).click();
      await expect(page.getByText("本章内容在系统中填写")).toBeVisible();
      await expect(
        page.getByRole("button", { name: /上传.*本章 Word/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "导出本章 PDF" }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: "test-results/award-achievement-form.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "生成预览" }).click();
    await expect(
      page.getByRole("heading", { name: "科技成就奖申报书" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table", { name: "候选人基本情况" }),
    ).toContainText(achievementTitle);
    await expect(
      page.getByRole("heading", {
        name: "二、所获科技奖励和荣誉称号情况（续）",
      }),
    ).toBeVisible();
    await expect(page.getByText("（续）（续）", { exact: false })).toHaveCount(
      0,
    );
    await expect(page.getByText("经济效益数据", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("table", { name: "七、科技成果转化及推广情况" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /八、附件|九、真实性承诺书/ }),
    ).toHaveCount(0);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出系统生成 PDF" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    let downloadedBytes = 0;
    for await (const chunk of stream) downloadedBytes += chunk.length;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(downloadedBytes).toBeGreaterThan(10_000);
    const previewPages = page.locator(".preview-page");
    const previewScreenshotCount = Math.min(await previewPages.count(), 5);
    for (let index = 0; index < previewScreenshotCount; index += 1) {
      await previewPages.nth(index).screenshot({
        path: `test-results/award-achievement-preview-page-${index + 1}.png`,
        style: ".preview-toolbar { visibility: hidden !important; }",
      });
    }
    await page.getByRole("button", { name: "返回填写" }).click();
    await page.getByRole("button", { name: "项目中心" }).click();

    await page
      .getByRole("button", { name: progressTitle, exact: true })
      .click();
    await page.getByRole("button", { name: /项目详细内容/ }).click();
    await expect(
      page.locator(".field-label", {
        hasText: "2．详细技术内容或科学研究内容",
      }),
    ).toBeVisible();
    await expect(
      page.locator(".field-label", {
        hasText: "3．主要发现点或技术发明点或技术创新点",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "项目中心" }).click();

    await page
      .getByRole("button", { name: inventionTitle, exact: true })
      .click();
    await page.getByRole("button", { name: /项目详细内容/ }).click();
    await expect(
      page.locator(".field-label", {
        hasText: "2．详细技术内容或科学研究内容",
      }),
    ).toBeVisible();
    await expect(
      page.locator(".field-label", {
        hasText: "3．主要发现点或技术发明点或技术创新点",
      }),
    ).toBeVisible();
    await expect(page.getByText(/国内外同类技术比较不超过两页/)).toBeVisible();
  } finally {
    for (const applicationId of applications) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});
