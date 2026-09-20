import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import path from "node:path";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

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
  await expect(firstTemplate).toContainText("一、项目基本情况.docx");
  const templateHref = await firstTemplate
    .getByRole("link", { name: "下载本章模板" })
    .getAttribute("href");
  const downloadPromise = page.waitForEvent("download");
  await firstTemplate.getByRole("link", { name: "下载本章模板" }).click();
  const templateDownload = await downloadPromise;
  expect(templateDownload.suggestedFilename()).toBe("一、项目基本情况.docx");
  expect(await templateDownload.createReadStream()).toBeTruthy();
  const templateResponse = await page.request.get(`${baseUrl}${templateHref}`);
  expect(templateResponse.ok()).toBe(true);
  expect(templateResponse.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  expect(templateResponse.headers()["content-disposition"]).toContain(
    "attachment",
  );
  expect(templateResponse.headers()["cache-control"]).toBe("no-store");
  const templateBody = await templateResponse.body();
  expect(templateBody.length).toBeGreaterThan(1_000);
  expect(templateBody.subarray(0, 4).toString("hex")).toBe("504b0304");
  const templateZip = await JSZip.loadAsync(templateBody);
  const documentXml = await templateZip
    .file("word/document.xml")
    .async("string");
  const xmlErrors = [];
  new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => xmlErrors.push(message),
      fatalError: (message) => xmlErrors.push(message),
    },
  }).parseFromString(documentXml, "application/xml");
  expect(xmlErrors).toEqual([]);
  const missingTemplateResponse = await page.request.get(
    `${baseUrl}/materials/not-found.docx`,
  );
  expect(missingTemplateResponse.status()).toBe(404);
  expect(await missingTemplateResponse.json()).toEqual(
    expect.objectContaining({ ok: false }),
  );

  await chapterNav.nth(1).click();
  await expect(page.locator(".section-template-bar")).toContainText(
    "二、项目简介.docx",
  );
  await page.getByRole("button", { name: "上传本章 Word" }).click();
  await page.locator('.import-dialog input[type="file"]').setInputFiles({
    name: "二、项目简介.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: await introductionDocx("这是分章 Word 自动识别验收内容。"),
  });
  await expect(page.locator(".recognition-item")).toContainText("项目简介");
  await page.getByRole("button", { name: /应用并保存/ }).click();
  await expect(page.getByText("候选字段已应用")).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator(".section-word-status")).toContainText(
    "二、项目简介.docx",
  );

  const saved = await page.request.get(
    `${baseUrl}/api/applications/${application.id}`,
  );
  const savedApplication = (await saved.json()).application;
  expect(savedApplication.data.introduction).toContain(
    "这是分章 Word 自动识别验收内容。",
  );
  const files = await page.request.get(
    `${baseUrl}/api/applications/${application.id}/files`,
  );
  expect((await files.json()).list).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file_type: "section_word:progress:introduction",
        file_name: "二、项目简介.docx",
      }),
    ]),
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

  await page.screenshot({
    path: "test-results/chapter-template-desktop.png",
    fullPage: true,
  });

  await chapterNav.nth(12).click();
  await expect(page.getByRole("heading", { name: "诚信承诺书" })).toBeVisible();
  await expect(page.getByText("模板填写要求")).toBeVisible();
  await expect(page.locator(".section-template-bar")).toContainText(
    "十三、诚信承诺书.docx",
  );
  await expect(
    page.getByRole("button", { name: "上传签章文件" }),
  ).toBeVisible();
  await page
    .locator('.section-template-bar input[type="file"]')
    .setInputFiles(
      path.resolve(
        "节能奖填报材料/附件3.中国节能协会创新奖申报书填写说明-1.pdf",
      ),
    );
  await expect(page.locator(".section-word-status")).toContainText(
    "附件3.中国节能协会创新奖申报书填写说明-1.pdf",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".section-template-actions")).toBeVisible();
  await page.screenshot({
    path: "test-results/chapter-template-mobile.png",
    fullPage: true,
  });
});
