import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { completeProjectData } from "./application-fixtures.mjs";
import { awardProfiles, getAwardSections } from "../src/award-profiles.js";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

test("all award chapter templates download and incomplete drafts preview without full export", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const fileName of [
    "附件1.中国节能协会创新奖奖励办法（2026修订版）-1.pdf",
    "附件2.中国节能协会创新奖申报书.doc",
    "附件3.中国节能协会创新奖申报书填写说明-1.pdf",
  ]) {
    const response = await page.request.get(
      `${baseUrl}/materials/${encodeURIComponent(fileName)}`,
    );
    expect(response.ok(), fileName).toBe(true);
    expect((await response.body()).length).toBeGreaterThan(1_000);
  }
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `formtestpreview${suffix}`;
  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "草稿预览验收用户",
      password: `Preview-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  for (const profile of awardProfiles) {
    for (const section of getAwardSections(profile.value)) {
      const response = await page.request.get(
        `${baseUrl}${section.templateHref}`,
      );
      expect(
        response.ok(),
        `${profile.templateFolder} ${section.templateFile}`,
      ).toBe(true);
      expect((await response.body()).subarray(0, 8).toString("hex")).toBe(
        "d0cf11e0a1b11ae1",
      );
    }

    const creation = await page.request.post(`${baseUrl}/api/applications`, {
      data: {
        awardType: profile.value,
        title: `${profile.templateFolder}草稿预览-${suffix}`,
        applicantUnit: "中国节能测试单位",
        year: 2026,
        workflowMode: "form",
      },
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    const applicationId = (await creation.json()).application.id;
    await page.goto(`${baseUrl}/#/applications/${applicationId}`);
    const fullTemplateHref = await page
      .getByRole("link", { name: "申报书模板" })
      .getAttribute("href");
    const fullTemplateResponse = await page.request.get(
      `${baseUrl}${fullTemplateHref}`,
    );
    expect(
      fullTemplateResponse.ok(),
      `${profile.templateFolder}完整申报书`,
    ).toBe(true);
    expect(
      (await fullTemplateResponse.body()).subarray(0, 8).toString("hex"),
    ).toBe("d0cf11e0a1b11ae1");
    await page.getByRole("button", { name: "生成预览" }).click();
    await expect(page.getByText("申报书预览", { exact: true })).toBeVisible();
    const exportButton = page.getByRole("button", {
      name: "导出 PDF",
      exact: true,
    });
    await expect(exportButton).toBeEnabled();
    let validationMessage = "";
    page.once("dialog", async (dialog) => {
      validationMessage = dialog.message();
      await dialog.accept();
    });
    await exportButton.click();
    expect(validationMessage).toContain("导出完整 PDF 前请完善");
    await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
  }
});

test("long basic fields stay within the first page for all awards", async ({
  page,
}) => {
  const suffix = Date.now();
  const username = `formtestlayout${suffix}`;
  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "预览分页测试",
      password: `Layout-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);
  for (const profile of awardProfiles) {
    const creation = await page.request.post(`${baseUrl}/api/applications`, {
      data: {
        awardType: profile.value,
        title: `${profile.templateFolder}分页测试-${suffix}`,
        year: 2026,
        workflowMode: "form",
      },
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    const id = (await creation.json()).application.id;
    const seed = await page.request.put(`${baseUrl}/api/applications/${id}`, {
      data: {
        data: completeProjectData(`${profile.templateFolder}分页测试`, {
          awardType: profile.value,
          plans: "国家节能专项计划和示范工程项目编号 2026-ABC；".repeat(18),
          candidate: {
            workUnit: "中国节能测试单位",
            mailingAddress: "北京市节能研究院技术创新中心".repeat(18),
          },
        }),
      },
    });
    expect(seed.ok(), await seed.text()).toBe(true);
    await page.goto(`${baseUrl}/#/applications/${id}`);
    await page.getByRole("button", { name: "生成预览" }).click();
    const fit = await page
      .locator(".preview-basic-page")
      .evaluate((article) => {
        const table = article
          .querySelector(":scope > table")
          .getBoundingClientRect();
        const footer = article
          .querySelector(":scope > footer")
          .getBoundingClientRect();
        return table.bottom <= footer.top - 2;
      });
    expect(fit, `${profile.templateFolder}基本情况表格进入页脚`).toBe(true);
    await page.request.delete(`${baseUrl}/api/applications/${id}`);
  }
});

async function introductionDocx(content) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>二、项目简介</w:t></w:r></w:p>
        <w:p><w:r><w:t>${content}</w:t></w:r></w:p>
      </w:body>
    </w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("split chapter templates download, import and persist independently", async ({
  page,
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `formtestchapters${suffix}`;
  const title = `分章模板验收-${suffix}`;

  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "分章模板验收用户",
      password: `ChapterTest-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  const creation = await page.request.post(`${baseUrl}/api/applications`, {
    data: {
      awardType: "节能减排科技进步奖",
      title,
      applicantUnit: "中国节能测试单位",
      year: 2026,
      workflowMode: "form",
    },
  });
  expect(creation.ok(), await creation.text()).toBe(true);
  const application = (await creation.json()).application;

  await page.goto(`${baseUrl}/#/applications/${application.id}`);
  await expect(
    page.getByRole("heading", { name: "项目基本情况" }),
  ).toBeVisible();

  const chapterNav = page.locator(".sidebar nav button");
  await expect(chapterNav).toHaveCount(13);
  await expect(chapterNav.nth(0)).toContainText("项目基本情况");
  await expect(chapterNav.nth(12)).toContainText("诚信承诺书");
  await expect(page.getByRole("button", { name: "Word 导入" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PDF 智能导入" })).toHaveCount(
    0,
  );

  const firstTemplate = page.locator(".section-template-bar");
  await expect(firstTemplate).toContainText("一、项目基本情况.doc");
  const templateHref = await firstTemplate
    .getByRole("link", { name: "下载本章模板" })
    .getAttribute("href");
  const downloadPromise = page.waitForEvent("download");
  await firstTemplate.getByRole("link", { name: "下载本章模板" }).click();
  const templateDownload = await downloadPromise;
  expect(templateDownload.suggestedFilename()).toBe("一、项目基本情况.doc");
  expect(await templateDownload.createReadStream()).toBeTruthy();
  const templateResponse = await page.request.get(`${baseUrl}${templateHref}`);
  expect(templateResponse.ok()).toBe(true);
  expect(templateResponse.headers()["content-type"]).toContain(
    "application/msword",
  );
  expect(templateResponse.headers()["content-disposition"]).toContain(
    "attachment",
  );
  expect(templateResponse.headers()["cache-control"]).toBe("no-store");
  const templateBody = await templateResponse.body();
  expect(templateBody.length).toBeGreaterThan(1_000);
  expect(templateBody.subarray(0, 8).toString("hex")).toBe("d0cf11e0a1b11ae1");
  const missingTemplateResponse = await page.request.get(
    `${baseUrl}/materials/not-found.docx`,
  );
  expect(missingTemplateResponse.status()).toBe(404);
  expect(await missingTemplateResponse.json()).toEqual(
    expect.objectContaining({ ok: false }),
  );

  await chapterNav.nth(1).click();
  await expect(page.locator(".section-template-bar")).toContainText(
    "二、项目简介.doc",
  );
  await expect(page.getByText("本章内容在系统中填写")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /上传.*本章 Word/ }),
  ).toHaveCount(0);
  await page
    .locator(".rich-editor")
    .first()
    .locator(".tiptap")
    .fill("这是系统在线填写的项目简介。");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  const saved = await page.request.get(
    `${baseUrl}/api/applications/${application.id}`,
  );
  expect((await saved.json()).application.data.introduction).toContain(
    "这是系统在线填写的项目简介。",
  );

  await chapterNav.nth(4).click();
  await expect(
    page.getByRole("heading", { name: "申请、获得知识产权情况表" }),
  ).toBeVisible();
  const directoryRows = page.locator(".ip-directory-row");
  await expect(directoryRows).toHaveCount(3);
  await expect(directoryRows.locator(".ip-directory-label")).toHaveText([
    "1．知识产权证明目录",
    "2．技术评价证明及行业审批文件目录",
    "3．应用单位目录",
  ]);
  await expect(
    directoryRows.nth(0).getByRole("heading", { level: 3 }),
  ).toHaveText("知识产权证明目录");
  await expect(
    directoryRows.nth(0).getByRole("button", { name: "添加知识产权" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /上传.*本章 Word/ }),
  ).toHaveCount(0);
  await expect(page.getByText("本章内容在系统中填写")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出本章 PDF" }),
  ).toBeVisible();
  const sectionDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本章 PDF" }).click();
  const sectionDownload = await sectionDownloadPromise;
  expect(sectionDownload.suggestedFilename()).toContain(
    "申请、获得知识产权情况表",
  );
  const sectionStream = await sectionDownload.createReadStream();
  const sectionChunks = [];
  for await (const chunk of sectionStream) sectionChunks.push(chunk);
  const sectionPdf = Buffer.concat(sectionChunks);
  expect(sectionPdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(sectionPdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(
    1,
  );
  await page.getByRole("button", { name: "返回填写" }).click();

  for (const chapterIndex of [5, 6]) {
    await chapterNav.nth(chapterIndex).click();
    await expect(page.getByText("本章内容在系统中填写")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /上传.*本章 Word/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "导出本章 PDF" }),
    ).toBeVisible();
  }

  await chapterNav.nth(9).click();
  await expect(page.getByRole("heading", { name: "附件目录" })).toBeVisible();
  await expect(page.getByText("本章内容在系统中填写")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /上传.*本章 Word/ }),
  ).toHaveCount(0);
  await expect(page.getByText("上传附件").first()).toBeVisible();

  await page.screenshot({
    path: "test-results/chapter-template-desktop.png",
    fullPage: true,
  });

  await chapterNav.nth(12).click();
  await expect(page.getByRole("heading", { name: "诚信承诺书" })).toBeVisible();
  await expect(page.getByText("模板填写要求")).toBeVisible();
  await expect(page.locator(".section-template-bar")).toContainText(
    "十三、诚信承诺书.doc",
  );
  await expect(
    page.getByRole("button", { name: "上传签章文件" }),
  ).toBeVisible();
  const signedPdf = new jsPDF();
  signedPdf.text("Signed chapter", 20, 20);
  await page.locator('.section-template-bar input[type="file"]').setInputFiles({
    name: "signed-chapter.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(signedPdf.output("arraybuffer")),
  });
  await expect(page.locator(".section-word-status")).toContainText(
    "signed-chapter.pdf",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".section-template-actions")).toBeVisible();
  await page.screenshot({
    path: "test-results/chapter-template-mobile.png",
    fullPage: true,
  });
});

test("invention intellectual-property chapter matches the shared project template", async ({
  page,
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `forminventionip${suffix}`;

  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "技术发明奖知识产权验收用户",
      password: `InventionIp-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  const creation = await page.request.post(`${baseUrl}/api/applications`, {
    data: {
      awardType: "节能减排技术发明奖",
      title: `技术发明奖知识产权验收-${suffix}`,
      applicantUnit: "中国节能测试单位",
      year: 2026,
      workflowMode: "form",
    },
  });
  expect(creation.ok(), await creation.text()).toBe(true);
  const application = (await creation.json()).application;

  await page.goto(`${baseUrl}/#/applications/${application.id}`);
  await page.locator(".sidebar nav button").nth(4).click();

  await expect(
    page.getByRole("heading", { name: "申请、获得知识产权情况表" }),
  ).toBeVisible();
  const directoryRows = page.locator(".ip-directory-row");
  await expect(directoryRows).toHaveCount(3);
  await expect(directoryRows.locator(".ip-directory-label")).toHaveText([
    "1．知识产权证明目录",
    "2．技术评价证明及行业审批文件目录",
    "3．应用单位目录",
  ]);
  await expect(
    directoryRows.nth(0).getByRole("button", { name: "添加知识产权" }),
  ).toBeVisible();
  await expect(
    directoryRows.nth(1).getByRole("button", { name: "添加文件" }),
  ).toBeVisible();
  await expect(
    directoryRows.nth(2).getByRole("button", { name: "添加应用单位" }),
  ).toBeVisible();

  const templateLink = page.getByRole("link", { name: "下载本章模板" });
  await expect(templateLink).toHaveAttribute(
    "href",
    /%E6%8A%80%E6%9C%AF%E5%8F%91%E6%98%8E%E5%A5%96.*%E4%BA%94%E3%80%81%E7%94%B3%E8%AF%B7%E3%80%81%E8%8E%B7%E5%BE%97%E7%9F%A5%E8%AF%86%E4%BA%A7%E6%9D%83%E6%83%85%E5%86%B5%E8%A1%A8\.doc/,
  );

  await directoryRows.nth(1).getByRole("button", { name: "添加文件" }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText(/已自动保存/)).toBeVisible();
  const saved = await page.request.get(
    `${baseUrl}/api/applications/${application.id}`,
  );
  expect(saved.ok(), await saved.text()).toBe(true);
  expect((await saved.json()).application.data.technicalEvaluation).toBe("");

  const recommendationPdf = new jsPDF();
  recommendationPdf.text("Recommendation", 20, 20);
  for (const [chapterIndex, sectionKey] of [
    [7, "unitRecommendation"],
    [8, "expertRecommendation"],
  ]) {
    await page.locator(".sidebar nav button").nth(chapterIndex).click();
    await expect(
      page.getByRole("button", { name: "上传Word / PDF" }),
    ).toBeVisible();
    const pdfUpload = await page.request.post(
      `${baseUrl}/api/applications/${application.id}/files`,
      {
        multipart: {
          category: `section_document:invention:${sectionKey}`,
          file: {
            name: `${sectionKey}.pdf`,
            mimeType: "application/pdf",
            buffer: Buffer.from(recommendationPdf.output("arraybuffer")),
          },
        },
      },
    );
    expect(pdfUpload.ok(), await pdfUpload.text()).toBe(true);
    const wordUpload = await page.request.post(
      `${baseUrl}/api/applications/${application.id}/files`,
      {
        multipart: {
          category: `section_document:invention:${sectionKey}`,
          file: {
            name: `${sectionKey}.docx`,
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            buffer: await introductionDocx("专家或单位意见回传验收。"),
          },
        },
      },
    );
    expect(wordUpload.ok(), await wordUpload.text()).toBe(true);
  }

  const richTable =
    '<p>技术发明奖表格</p><table style="width: 1200px"><tbody><tr><th>技术指标</th><th>国内外先进水平</th><th>本项目技术</th></tr><tr><td>转换效率</td><td>85%</td><td>92%</td></tr></tbody></table>';
  await page.getByRole("button", { name: "项目中心" }).click();
  await page.waitForTimeout(1000);
  const previewSeed = await page.request.put(
    `${baseUrl}/api/applications/${application.id}`,
    {
      data: {
        data: completeProjectData(`技术发明奖知识产权验收-${suffix}`, {
          technicalContent: richTable,
          disciplines: [
            {
              name: "能源系统工程",
              code: "4806010",
              status: "confirmed",
              path: ["480", "48060", "4806010"],
            },
          ],
          cooperationRecords: [
            {
              method: "联合研发",
              collaborators: "甲完成人、乙完成人",
              period: "2024-01 至 2026-01",
              output: "形成核心发明",
              evidence: "附件 1",
              notes: "无",
            },
          ],
        }),
      },
    },
  );
  expect(previewSeed.ok(), await previewSeed.text()).toBe(true);
  await page.goto(`${baseUrl}/#/applications/${application.id}`);
  let previewAlert = "";
  page.once("dialog", async (dialog) => {
    previewAlert = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "生成预览" }).click();
  await page.waitForTimeout(1000);
  expect(previewAlert).toBe("");
  const inventionRichTable = page
    .locator(
      '.preview-detail-page[data-section-key="details"] .preview-rich-text table',
    )
    .first();
  await expect(inventionRichTable).toBeVisible();
  const tableLayout = await inventionRichTable.evaluate((table) => ({
    borderCollapse: getComputedStyle(table).borderCollapse,
    width: table.getBoundingClientRect().width,
    containerWidth: table.parentElement.getBoundingClientRect().width,
  }));
  expect(tableLayout.borderCollapse).toBe("collapse");
  expect(tableLayout.width).toBeLessThanOrEqual(tableLayout.containerWidth + 1);
  await expect(
    page.getByRole("table", { name: "完成人合作关系情况汇总表" }),
  ).toContainText("形成核心发明");
});

test("project awards accept DOC, DOCX and PDF cooperation statements", async ({
  page,
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const pdf = new jsPDF();
  pdf.text("Cooperation statement", 20, 20);

  for (const [index, [awardType, awardCode]] of [
    ["节能减排科技进步奖", "progress"],
    ["节能减排技术发明奖", "invention"],
  ].entries()) {
    const username = `coop${index}${suffix}`;
    const registration = await page.request.post(
      `${baseUrl}/api/auth/register`,
      {
        data: {
          username,
          email: `${username}@example.test`,
          displayName: `${awardType}合作关系验收用户`,
          password: `Cooperation-${suffix}-${index}`,
        },
      },
    );
    expect(registration.ok(), await registration.text()).toBe(true);

    const creation = await page.request.post(`${baseUrl}/api/applications`, {
      data: {
        awardType,
        title: `${awardType}合作关系验收-${suffix}`,
        applicantUnit: "中国节能测试单位",
        year: 2026,
        workflowMode: "form",
      },
    });
    expect(creation.ok(), await creation.text()).toBe(true);
    const application = (await creation.json()).application;

    await page.goto(`${baseUrl}/#/applications/${application.id}`);
    await page.locator(".sidebar nav button").nth(5).click();
    const cooperationInput = page.locator(
      '.cooperation-section input[type="file"]',
    );
    await expect(cooperationInput).toHaveAttribute("accept", /\.doc,/);
    await expect(cooperationInput).toHaveAttribute("accept", /\.docx/);
    await expect(cooperationInput).toHaveAttribute("accept", /\.pdf/);

    const category = `section_document:${awardCode}:peopleCooperation`;
    const uploadedFiles = [];
    for (const file of [
      {
        name: "完成人合作关系说明.doc",
        mimeType: "application/msword",
        buffer: Buffer.from("legacy Word cooperation statement"),
      },
      {
        name: "完成人合作关系说明.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: await introductionDocx("完成人合作关系说明验收。"),
      },
      {
        name: "完成人合作关系说明.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(pdf.output("arraybuffer")),
      },
    ]) {
      const upload = await page.request.post(
        `${baseUrl}/api/applications/${application.id}/files`,
        { multipart: { category, file } },
      );
      expect(upload.ok(), await upload.text()).toBe(true);
      const uploadedFile = (await upload.json()).file;
      uploadedFiles.push(uploadedFile);
      const download = await page.request.get(
        `${baseUrl}/api/applications/${application.id}/files/${uploadedFile.id}/download`,
      );
      expect(download.ok(), await download.text()).toBe(true);
      if (!uploadedFile.file_name.endsWith(".doc")) {
        const preview = await page.request.get(
          `${baseUrl}/api/applications/${application.id}/files/${uploadedFile.id}/preview`,
        );
        expect(preview.ok(), await preview.text()).toBe(true);
        expect((await preview.json()).pages.length).toBeGreaterThan(0);
      }
    }

    for (const supersededFile of uploadedFiles.slice(0, -1)) {
      const supersededDownload = await page.request.get(
        `${baseUrl}/api/applications/${application.id}/files/${supersededFile.id}/download`,
      );
      expect(supersededDownload.status()).toBe(404);
    }

    const files = await page.request.get(
      `${baseUrl}/api/applications/${application.id}/files`,
    );
    expect(files.ok(), await files.text()).toBe(true);
    expect(
      (await files.json()).list.filter((file) => file.file_type === category),
    ).toEqual([
      expect.objectContaining({
        id: uploadedFiles.at(-1).id,
        file_name: "完成人合作关系说明.pdf",
      }),
    ]);
  }
});

test("achievement chapters download and PDF attachments upload", async ({
  page,
}) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `achchap${suffix}`;
  const registration = await page.request.post(`${baseUrl}/api/auth/register`, {
    data: {
      username,
      email: `${username}@example.test`,
      displayName: "个人奖章节验收用户",
      password: `Achievement-${suffix}`,
    },
  });
  expect(registration.ok(), await registration.text()).toBe(true);

  const creation = await page.request.post(`${baseUrl}/api/applications`, {
    data: {
      awardType: "节能减排科技成就奖",
      title: `个人奖章节验收-${suffix}`,
      applicantUnit: "中国节能测试单位",
      year: 2026,
      workflowMode: "form",
    },
  });
  expect(creation.ok(), await creation.text()).toBe(true);
  const application = (await creation.json()).application;

  await page.goto(`${baseUrl}/#/applications/${application.id}`);
  const chapterNav = page.locator(".sidebar nav button");
  await expect(chapterNav).toHaveCount(10);

  let basicTemplate;
  for (let index = 0; index < 10; index += 1) {
    await chapterNav.nth(index).click();
    const href = await page
      .locator(".section-template-bar")
      .getByRole("link", { name: "下载本章模板" })
      .getAttribute("href");
    const response = await page.request.get(`${baseUrl}${href}`);
    expect(response.ok(), `第 ${index + 1} 章模板下载失败`).toBe(true);
    const body = await response.body();
    expect(body.length).toBeGreaterThan(1_000);
    if (index === 0) basicTemplate = body;
  }
  const chapterUpload = await page.request.post(
    `${baseUrl}/api/applications/${application.id}/files`,
    {
      multipart: {
        category: "section_word:achievement:basic",
        file: {
          name: "一、基本情况.doc",
          mimeType: "application/msword",
          buffer: basicTemplate,
        },
      },
    },
  );
  expect(chapterUpload.ok(), await chapterUpload.text()).toBe(true);

  await chapterNav.nth(2).click();
  await page.getByRole("button", { name: "添加论文或专著" }).click();
  await expect(page.getByRole("columnheader")).toHaveText([
    "序号",
    "*基本信息（名称 + 年份 + 本人排名 + 主要合作者 + 发表刊物 / 出版社）",
    "本人作用和主要贡献（限 100 字 / 项）",
    "操作",
  ]);

  await chapterNav.nth(7).click();
  await expect(page.getByRole("heading", { name: "证明材料" })).toBeVisible();
  const pdf = new jsPDF();
  pdf.text("Achievement PDF", 20, 20);
  await page
    .locator(".attachment-row-wrap")
    .first()
    .locator('input[type="file"]')
    .setInputFiles({
      name: "achievement-proof.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf.output("arraybuffer")),
    });
  await expect(
    page
      .locator(".attachment-row-wrap")
      .first()
      .getByText("已上传 1 件 / 1 页"),
  ).toBeVisible();

  await page.screenshot({
    path: "test-results/achievement-templates-and-attachments.png",
    fullPage: true,
  });
});
