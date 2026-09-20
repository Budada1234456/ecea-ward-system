import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import {
  completePerson,
  completeProjectData,
  completeUnit,
  tinyPng,
} from "./application-fixtures.mjs";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";
const execFileAsync = promisify(execFile);
const requiredProjectMaterials = [
  "technical_proof",
  "application_proof",
  "evaluation_report",
  "novelty_report",
  "patent_proof",
  "inventor_id",
  "unit_license",
];

test("achievement tables match page one and rich content is not clipped", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `fonttest${suffix}`;
  const title = `个人奖项排版验收-${suffix}`;
  let applicationId;

  const registerResponse = await page.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        username,
        email: `${username}@example.test`,
        displayName: "个人奖项排版验收用户",
        password: `Achievement-${suffix}`,
      },
    },
  );
  expect(registerResponse.ok(), await registerResponse.text()).toBe(true);

  const createResponse = await page.request.post(
    `${baseUrl}/api/applications`,
    {
      data: {
        title,
        year: 2026,
        awardType: "节能减排科技成就奖",
        workflowMode: "form",
      },
    },
  );
  const createBody = await createResponse.json();
  expect(createResponse.ok(), JSON.stringify(createBody)).toBe(true);
  applicationId = createBody.application.id;

  try {
    const imageResponse = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "content_image:transformation",
          file: {
            name: "achievement-layout.png",
            mimeType: "image/png",
            buffer: tinyPng,
          },
        },
      },
    );
    const imageBody = await imageResponse.json();
    expect(imageResponse.ok(), JSON.stringify(imageBody)).toBe(true);
    const imageUrl = `/api/applications/${applicationId}/files/${imageBody.file.id}/download?inline=1`;
    const denseRows = Array.from(
      { length: 8 },
      (_, index) =>
        `<tr><td><p style="margin: 12px 0; text-indent: 2em; line-height: 2">技术指标 ${index + 1}</p></td><td>成果转化和推广应用情况说明 ${index + 1}</td><td>达到行业先进水平</td></tr>`,
    ).join("");
    const transformation = [
      "<p>科技成果转化分页起始标记</p>",
      `<p><img src="${imageUrl}" alt="成果转化验收图片" style="width: 80%"></p>`,
      `<p>${"成果已在多家单位完成推广应用。".repeat(10)}</p>`,
      "<p>表 1 科技成果转化情况表</p>",
      `<table style="width: 1200px"><colgroup><col style="width: 360px"><col style="width: 420px"><col style="width: 420px"></colgroup><tbody>${denseRows}</tbody></table>`,
      "<p>表后正文应与表格连续排版。</p>",
      `<p>${"项目形成了稳定的产业化应用能力。".repeat(12)}</p>`,
      "<p>科技成果转化分页结束标记</p>",
    ].join("");
    const records = Array.from({ length: 6 }, (_, index) => ({
      name: `个人奖项记录 ${index + 1}`,
      org: "中国节能测试单位",
      date: "2026-09-04",
      totalPeople: "5",
      personalRank: "1",
    }));
    const seedResponse = await page.request.put(
      `${baseUrl}/api/applications/${applicationId}`,
      {
        data: {
          data: completeProjectData(title, {
            workSummary: "候选人长期从事节能减排科技工作。",
            candidate: {
              birthDate: "1986-05-04",
              workUnit: "北京理工大学",
            },
            awardRecords: records,
            paperRecords: records.map((record) => ({
              title: record.name,
              contribution: "本人完成主要研究工作",
            })),
            ipRecords: records.map((record) => ({
              name: record.name,
              type: "发明专利",
              country: "中国",
              authorizationNumber: `ZL2026${record.totalPeople}`,
            })),
            researchRecords: records,
            engineeringRecords: records,
            transformation,
          }),
        },
      },
    );
    expect(seedResponse.ok(), await seedResponse.text()).toBe(true);

    for (const category of [
      "achievement_honors",
      "achievement_publications",
      "achievement_ip",
      "achievement_research",
      "achievement_benefits",
    ]) {
      const uploadResponse = await page.request.post(
        `${baseUrl}/api/applications/${applicationId}/files`,
        {
          multipart: {
            category,
            file: {
              name: `${category}.png`,
              mimeType: "image/png",
              buffer: tinyPng,
            },
          },
        },
      );
      expect(uploadResponse.ok(), await uploadResponse.text()).toBe(true);
    }

    await page.goto(baseUrl);
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "生成预览" }).click();
    await expect(page.locator(".preview-pages")).toHaveClass(
      /preview-pages--achievement/,
    );

    const tableFonts = await page.evaluate(() => {
      const basic = document.querySelector(
        ".preview-achievement-basic > table td",
      );
      const sections = [
        "honors",
        "publications",
        "achievementIp",
        "research",
        "engineering",
      ];
      return {
        basic: getComputedStyle(basic).fontSize,
        sections: sections.map(
          (key) =>
            getComputedStyle(
              document.querySelector(
                `.preview-table-page[data-section-key="${key}"] td`,
              ),
            ).fontSize,
        ),
      };
    });
    expect(tableFonts.basic).toBe("14.6667px");
    expect(tableFonts.sections).toEqual(
      Array.from({ length: 5 }, () => tableFonts.basic),
    );

    const transformationPages = page.locator(
      '.preview-text-page[data-section-key="transformation"]',
    );
    expect(await transformationPages.count()).toBeGreaterThan(1);
    await expect(transformationPages.last()).toContainText(
      "科技成果转化分页结束标记",
    );
    const richTablePage = transformationPages.filter({
      has: page.locator(".preview-rich-text table"),
    });
    await expect(richTablePage).toContainText("表 1 科技成果转化情况表");
    await expect(richTablePage).toContainText("表后正文应与表格连续排版。");
    const richTableLayout = await richTablePage
      .locator(".preview-rich-text table")
      .evaluate((table) => {
        const container = table.closest(".preview-rich-text");
        const cell = table.querySelector("td");
        const cellParagraph = table.querySelector("td p");
        const column = table.querySelector("col");
        const tableWidth = table.getBoundingClientRect().width;
        const cellStyle = getComputedStyle(cell);
        return {
          fitsContainer:
            tableWidth <= container.getBoundingClientRect().width + 0.5,
          tableLayout: getComputedStyle(table).tableLayout,
          columnsFitTable:
            Number.parseFloat(getComputedStyle(column).width) <= tableWidth &&
            Number.parseFloat(cellStyle.width) <= tableWidth,
          cellFontSize: cellStyle.fontSize,
          cellPaddingTop: Number.parseFloat(cellStyle.paddingTop),
          paragraphMarginTop: getComputedStyle(cellParagraph).marginTop,
          paragraphMarginBottom: getComputedStyle(cellParagraph).marginBottom,
          paragraphTextIndent: getComputedStyle(cellParagraph).textIndent,
          paragraphLineHeight: getComputedStyle(cellParagraph).lineHeight,
        };
      });
    expect(richTableLayout).toEqual({
      fitsContainer: true,
      tableLayout: "auto",
      columnsFitTable: true,
      cellFontSize: "10.6667px",
      cellPaddingTop: expect.any(Number),
      paragraphMarginTop: "0px",
      paragraphMarginBottom: "0px",
      paragraphTextIndent: "0px",
      paragraphLineHeight: "12.2667px",
    });
    expect(richTableLayout.cellPaddingTop).toBeLessThan(2);
    const clippingAudit = await transformationPages.evaluateAll((pages) =>
      pages.map((previewPage) => {
        const body = previewPage.querySelector(".preview-body-text");
        const footer = previewPage.querySelector(":scope > footer");
        return {
          bodyFits: body.scrollHeight <= body.clientHeight + 1,
          clearsFooter:
            body.getBoundingClientRect().bottom + 8 <=
            footer.getBoundingClientRect().top,
        };
      }),
    );
    expect(clippingAudit.every(({ bodyFits }) => bodyFits)).toBe(true);
    expect(clippingAudit.every(({ clearsFooter }) => clearsFooter)).toBe(true);
    await page
      .locator('.preview-table-page[data-section-key="honors"]')
      .first()
      .screenshot({
        path: "test-results/achievement-honors-font.png",
        style: ".preview-toolbar { visibility: hidden !important; }",
      });
    await richTablePage.screenshot({
      path: "test-results/achievement-transformation-page.png",
      style: ".preview-toolbar { visibility: hidden !important; }",
    });
  } finally {
    if (applicationId) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});

test("progress preview and PDF export use the Word template font sizes", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `fonttest${suffix}`;
  const title = `科技进步奖字号验收-${suffix}`;
  let applicationId;

  const registerResponse = await page.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        username,
        email: `${username}@example.test`,
        displayName: "字号验收用户",
        password: `Font-${suffix}`,
      },
    },
  );
  expect(registerResponse.ok(), await registerResponse.text()).toBe(true);

  const createResponse = await page.request.post(
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
  const createBody = await createResponse.json();
  expect(createResponse.ok(), JSON.stringify(createBody)).toBe(true);
  applicationId = createBody.application.id;

  try {
    const seedResponse = await page.request.put(
      `${baseUrl}/api/applications/${applicationId}`,
      {
        data: {
          data: completeProjectData(title, {
            introduction:
              '<p><span style="font-size: 8px">项目简介字号应与 Word 模板保持一致。</span></p>',
            technicalContent:
              '<p><span style="font-size: 9px">详细内容正文应使用小四号字。</span></p><p>表 1 国内外技术对比情况表</p><table style="width: 1200px"><colgroup><col style="width: 240px"><col style="width: 180px"><col style="width: 260px"><col style="width: 180px"><col style="width: 180px"><col style="width: 180px"></colgroup><tbody><tr><th colspan="3"><span style="font-size: 24px">紧凑表头</span></th><th>国内外先进水平</th><th>本项目技术</th><th>对比结果</th></tr><tr><th rowspan="3">安全承载</th><td rowspan="3">资源辨识</td><td><p style="margin: 12px 0; text-indent: 2em; line-height: 2">星顶光伏测算准确度</p></td><td>77.55%</td><td>91%</td><td>国际领先</td></tr><tr><td>承载力评估规模</td><td>局部区域</td><td>省域百万级节点</td><td>国际首次实现</td></tr><tr><td>承载力评估颗粒度</td><td>区县级</td><td>村庄级和配变级</td><td>国际领先</td></tr><tr><th rowspan="3">协同调控</th><td rowspan="2">感知预测</td><td>功率实时感知准确率</td><td>92.5%</td><td>97.55%</td><td>国际领先</td></tr><tr><td>辐照度预测准确率</td><td>93.25%</td><td>95.98%</td><td>国际领先</td></tr><tr><td>调控消纳</td><td>省级分布式资源控制云平台</td><td>接入设备数量超过一百万台</td><td>接入设备数量超过一千万台</td><td>国际领先</td></tr></tbody></table><p>表格之后的正文必须完整显示。</p>',
            people: [
              {
                ...completePerson("完成人字号验收"),
                contribution:
                  '<p><span style="font-size: 8px">个人技术贡献字号应为小四。</span></p>',
              },
            ],
          }),
        },
      },
    );
    expect(seedResponse.ok(), await seedResponse.text()).toBe(true);

    for (const category of [
      "recommendation_signed",
      ...requiredProjectMaterials,
    ]) {
      const upload = await page.request.post(
        `${baseUrl}/api/applications/${applicationId}/files`,
        {
          multipart: {
            category,
            file: {
              name: `${category}.png`,
              mimeType: "image/png",
              buffer: tinyPng,
            },
          },
        },
      );
      expect(upload.ok(), await upload.text()).toBe(true);
    }

    await page.goto(baseUrl);
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "预览当前申报书" }).click();
    await expect(page.locator(".preview-pages")).toHaveClass(
      /preview-pages--progress/,
    );

    const fontSizes = await page.evaluate(() => {
      const size = (selector) =>
        getComputedStyle(document.querySelector(selector)).fontSize;
      return {
        basicTable: size(".preview-basic-page > table"),
        sectionTitle: size(".preview-form-page > h3"),
        body: size(".preview-body-text"),
        ipTable: size(".preview-ip-page .preview-subtable table"),
        entityTable: size(".preview-entity-page table"),
        introductionNestedText: size(
          '.preview-page[data-section-key="introduction"] td span',
        ),
        detailsNestedText: size(
          '.preview-page[data-section-key="details"] td span',
        ),
        tableUnit: size(".preview-economic-page .preview-table-unit"),
        awardNote: size(".preview-award-page .preview-note-row td"),
        pageNumber: size(".preview-page > footer"),
      };
    });
    expect(fontSizes).toEqual({
      basicTable: "16px",
      sectionTitle: "21.3333px",
      body: "16px",
      ipTable: "16px",
      entityTable: "16px",
      introductionNestedText: "16px",
      detailsNestedText: "16px",
      tableUnit: "16px",
      awardNote: "16px",
      pageNumber: "14px",
    });
    const detailRichTableLayout = await page
      .locator(
        '.preview-detail-page[data-section-key="details"] .preview-rich-text table',
      )
      .first()
      .evaluate((table) => {
        const container = table.closest(".preview-rich-text");
        const cell = table.querySelector("td");
        const column = table.querySelector("col");
        const nestedText = table.querySelector("span");
        const cellParagraph = table.querySelector("td p");
        const cellStyle = getComputedStyle(cell);
        const tableWidth = table.getBoundingClientRect().width;
        return {
          fitsContainer:
            tableWidth <= container.getBoundingClientRect().width + 0.5,
          tableLayout: getComputedStyle(table).tableLayout,
          columnsFitTable:
            Number.parseFloat(getComputedStyle(column).width) <= tableWidth &&
            Number.parseFloat(cellStyle.width) <= tableWidth,
          nestedFontSize: getComputedStyle(nestedText).fontSize,
          cellPaddingTop: Number.parseFloat(cellStyle.paddingTop),
          paragraphMarginTop: getComputedStyle(cellParagraph).marginTop,
          paragraphMarginBottom: getComputedStyle(cellParagraph).marginBottom,
          paragraphTextIndent: getComputedStyle(cellParagraph).textIndent,
          paragraphLineHeight: getComputedStyle(cellParagraph).lineHeight,
          bodyFits: container.scrollHeight <= container.clientHeight + 1,
          tableFitsBody:
            table.getBoundingClientRect().bottom <=
            container.getBoundingClientRect().bottom + 1,
        };
      });
    expect(detailRichTableLayout).toEqual({
      fitsContainer: true,
      tableLayout: "auto",
      columnsFitTable: true,
      nestedFontSize: "10.6667px",
      cellPaddingTop: expect.any(Number),
      paragraphMarginTop: "0px",
      paragraphMarginBottom: "0px",
      paragraphTextIndent: "0px",
      paragraphLineHeight: "12.2667px",
      bodyFits: true,
      tableFitsBody: true,
    });
    expect(detailRichTableLayout.cellPaddingTop).toBeLessThan(2);
    const richTablePage = page
      .locator('.preview-detail-page[data-section-key="details"]')
      .filter({ hasText: "紧凑表头" });
    await expect(richTablePage).toContainText("表 1 国内外技术对比情况表");
    await expect(richTablePage).toContainText("表格之后的正文必须完整显示。");
    await expect(
      richTablePage.locator(
        ".preview-section-table > tbody > tr:first-child > th",
      ),
    ).not.toContainText("（续）");
    await expect(page.getByText("表格之后的正文必须完整显示。")).toBeVisible();
    const detailPageOverflowAudit = await page
      .locator('.preview-detail-page[data-section-key="details"]')
      .evaluateAll((pages) =>
        pages.map((previewPage) => {
          const body = previewPage.querySelector(".preview-body-text");
          const footer = previewPage.querySelector(":scope > footer");
          return {
            bodyFits: body.scrollHeight <= body.clientHeight + 1,
            clearsFooter:
              body.getBoundingClientRect().bottom + 8 <=
              footer.getBoundingClientRect().top,
          };
        }),
      );
    expect(detailPageOverflowAudit.every(({ bodyFits }) => bodyFits)).toBe(
      true,
    );
    expect(
      detailPageOverflowAudit.every(({ clearsFooter }) => clearsFooter),
    ).toBe(true);
    await richTablePage.screenshot({
      path: "test-results/progress-detail-rich-table.png",
      style: ".preview-toolbar { visibility: hidden !important; }",
    });
    const personTableFontAudit = await page
      .locator(".preview-person-page table")
      .evaluate((table) => {
        const textElements = [...table.querySelectorAll("th, td, th *, td *")]
          .filter((element) => element.textContent?.trim())
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            text: element.textContent.trim().slice(0, 24),
            pixels: Number.parseFloat(getComputedStyle(element).fontSize),
          }));
        return {
          minimum: Math.min(...textElements.map(({ pixels }) => pixels)),
          undersized: textElements.filter(({ pixels }) => pixels < 16),
        };
      });
    expect(personTableFontAudit.minimum).toBe(16);
    expect(personTableFontAudit.undersized).toEqual([]);

    let exportPayload;
    await page.route("**/api/pdf-export", async (route) => {
      exportPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "%PDF-1.4\n%%EOF",
      });
    });
    await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
    await expect.poll(() => exportPayload).toBeTruthy();
    const exportedHtml = exportPayload.parts
      .filter((part) => part.type === "html")
      .map((part) => part.html)
      .join("");
    expect(exportedHtml).toContain("preview-progress-document");
  } finally {
    if (applicationId) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function tallPng() {
  const width = 10;
  const height = 1000;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 64)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function withTrailingBlankWordPage(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentPart = zip.file("word/document.xml");
  const xml = await documentPart.async("string");
  const pageBreak =
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p></w:p>';
  const next = xml.replace(/<w:sectPr(?:\s|>)/, (match) => `${pageBreak}${match}`);
  zip.file("word/document.xml", next);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("rich media, entity pages and the complete PDF export stay intact", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `formtest${suffix}`;
  const title = `预览导出完整性验收-${suffix}`;
  const errors = [];
  let applicationId;

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  const registerResponse = await page.request.post(
    `${baseUrl}/api/auth/register`,
    {
      data: {
        username,
        email: `${username}@example.test`,
        displayName: "预览导出验收用户",
        password: `Preview-${suffix}`,
      },
    },
  );
  expect(registerResponse.ok(), await registerResponse.text()).toBe(true);

  const createResponse = await page.request.post(
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
  const createBody = await createResponse.json();
  expect(createResponse.ok(), JSON.stringify(createBody)).toBe(true);
  applicationId = createBody.application.id;

  try {
    const imageResponse = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "content_image:technicalContent",
          file: {
            name: "preview-proof.png",
            mimeType: "image/png",
            buffer: tallPng(),
          },
        },
      },
    );
    const imageBody = await imageResponse.json();
    expect(imageResponse.ok(), JSON.stringify(imageBody)).toBe(true);
    const imageUrl = `/api/applications/${applicationId}/files/${imageBody.file.id}/download?inline=1`;
    const richContent = [
      "<p><strong>富文本图表验收标记</strong></p>",
      `<img src="${imageUrl}" alt="预览验收图片">`,
      '<table style="border-collapse: collapse; width: 100%"><tbody>',
      '<tr><th style="border: 1px solid black">指标</th><th style="border: 1px solid black">结果</th></tr>',
      '<tr><td style="border: 1px solid black">图片与表格</td><td style="border: 1px solid black">通过</td></tr>',
      "</tbody></table>",
    ].join("");
    const paginatedIntroduction = [
      "<p>项目简介分页边框验收标记</p>",
      `<img src="${imageUrl}" alt="项目简介验收图片一">`,
      `<img src="${imageUrl}" alt="项目简介验收图片二">`,
      `<img src="${imageUrl}" alt="项目简介验收图片三">`,
    ].join("");

    const seedResponse = await page.request.put(
      `${baseUrl}/api/applications/${applicationId}`,
      {
        data: {
          data: completeProjectData(title, {
            introduction: paginatedIntroduction,
            technicalContent: richContent,
            ipRecords: [
              {
                name: "余热回收控制方法",
                type: "发明专利",
                country: "中国",
                applicationNumber: "CN202610001",
                authorizationNumber: "ZL202610001",
              },
            ],
            technicalEvaluation:
              "<table><tbody><tr><td>文件名称</td><td>出具单位</td><td>出具时间</td><td>文件编号</td></tr><tr><td>科技成果评价报告</td><td>中国节能协会</td><td>2026-08</td><td>评价字第001号</td></tr></tbody></table>",
            applicationUnits: [
              {
                unitName: "节能示范有限公司",
                startDate: "2025-01",
                contactPhone: "李工 13800000000",
                economicBenefit: "860",
              },
            ],
            people: [
              {
                ...completePerson("完成人甲"),
                id: "person-preview-1",
                contribution: "贡献甲",
              },
              {
                ...completePerson("完成人乙"),
                id: "person-preview-2",
                contribution: "贡献乙",
              },
            ],
            units: [
              {
                ...completeUnit("完成单位甲"),
                id: "unit-preview-1",
                contribution: "贡献甲",
              },
              {
                ...completeUnit("完成单位乙"),
                id: "unit-preview-2",
                contribution: "贡献乙",
              },
            ],
          }),
        },
      },
    );
    expect(seedResponse.ok(), await seedResponse.text()).toBe(true);

    for (const category of [
      "recommendation_signed",
      ...requiredProjectMaterials,
    ]) {
      const upload = await page.request.post(
        `${baseUrl}/api/applications/${applicationId}/files`,
        {
          multipart: {
            category,
            file: {
              name: `${category}.png`,
              mimeType: "image/png",
              buffer: tinyPng,
            },
          },
        },
      );
      expect(upload.ok(), await upload.text()).toBe(true);
    }

    const recommendationWord = await fs.readFile(
      "节能奖填报材料/科技进步奖/八、申报、推荐单位意见.docx",
    );
    const recommendationUpload = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "section_word:progress:unitRecommendation",
          file: {
            name: "八、申报、推荐单位意见.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            buffer: recommendationWord,
          },
        },
      },
    );
    expect(recommendationUpload.ok(), await recommendationUpload.text()).toBe(
      true,
    );

    const expertRecommendationWord = await withTrailingBlankWordPage(
      await fs.readFile(
        "节能奖填报材料/科技进步奖/九、专家推荐意见.docx",
      ),
    );
    const expertRecommendationUpload = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "section_word:progress:expertRecommendation",
          file: {
            name: "九、专家推荐意见.docx",
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            buffer: expertRecommendationWord,
          },
        },
      },
    );
    expect(
      expertRecommendationUpload.ok(),
      await expertRecommendationUpload.text(),
    ).toBe(true);

    const signedDocument = new jsPDF();
    signedDocument.text("Signed declaration page 1", 20, 20);
    for (let pageNumber = 2; pageNumber <= 51; pageNumber += 1) {
      signedDocument.addPage();
      signedDocument.text(`Signed declaration page ${pageNumber}`, 20, 20);
    }
    const authenticityUpload = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "section_signed:progress:authenticity",
          file: {
            name: "十一、真实性承诺书.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from(signedDocument.output("arraybuffer")),
          },
        },
      },
    );
    expect(authenticityUpload.ok(), await authenticityUpload.text()).toBe(true);

    const confidentialityDocument = new jsPDF();
    confidentialityDocument.text("Confidentiality page 1", 20, 20);
    confidentialityDocument.addPage();
    confidentialityDocument.text("Confidentiality page 2", 20, 20);
    const confidentialityUpload = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "section_signed:progress:confidentiality",
          file: {
            name: "十二、不涉密承诺函.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from(confidentialityDocument.output("arraybuffer")),
          },
        },
      },
    );
    expect(
      confidentialityUpload.ok(),
      await confidentialityUpload.text(),
    ).toBe(true);

    const integrityDocument = new jsPDF();
    integrityDocument.text("Integrity page 1", 20, 20);
    const integrityUpload = await page.request.post(
      `${baseUrl}/api/applications/${applicationId}/files`,
      {
        multipart: {
          category: "section_signed:progress:integrity",
          file: {
            name: "十三、诚信承诺书.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from(integrityDocument.output("arraybuffer")),
          },
        },
      },
    );
    expect(integrityUpload.ok(), await integrityUpload.text()).toBe(true);

    await page.route(
      `**/api/applications/${applicationId}/files`,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.continue();
      },
    );

    await page.goto(baseUrl);
    await page.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("button", { name: "预览当前申报书" }).click();
    await expect(page.getByText("申报书预览", { exact: true })).toBeVisible();

    const richPage = page
      .locator(".preview-text-page")
      .filter({ hasText: "富文本图表验收标记" });
    const image = richPage.getByRole("img", { name: "预览验收图片" });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => element.naturalHeight))
      .toBeGreaterThan(0);
    await expect(richPage.locator(".preview-rich-text table")).toContainText(
      "图片与表格",
    );
    await expect(richPage.locator(".preview-rich-text table")).toContainText(
      "通过",
    );

    for (const [index, name] of ["完成人甲", "完成人乙"].entries()) {
      const personTable = page.getByRole("table", {
        name: `第 ${index + 1} 完成人情况表`,
      });
      await expect(personTable).toContainText(name);
      await expect(personTable.locator("xpath=ancestor::article")).toHaveCount(
        1,
      );
    }
    for (const [index, name] of ["完成单位甲", "完成单位乙"].entries()) {
      const unitTable = page.getByRole("table", {
        name: `第 ${index + 1} 完成单位情况表`,
      });
      await expect(unitTable).toContainText(name);
      await expect(unitTable).toContainText("传真");
      await expect(unitTable).toContainText("010-88886666");
      await expect(unitTable).not.toContainText(
        "注：务必确保以上相关信息完整无误。",
      );
      await expect(unitTable.locator("xpath=ancestor::article")).toHaveCount(1);
    }

    const basicPage = page.locator(".preview-basic-page");
    const dateRowLayout = await basicPage
      .locator("tbody tr:last-child")
      .evaluate((row) => ({
        height: row.getBoundingClientRect().height,
        valuesStayOnOneLine: [
          ...row.querySelectorAll(".preview-date-range-value"),
        ].every(
          (value) =>
            value.getClientRects().length === 1 &&
            value.scrollWidth <= value.clientWidth,
        ),
      }));
    expect(dateRowLayout.height).toBeLessThanOrEqual(40);
    expect(dateRowLayout.valuesStayOnOneLine).toBe(true);
    const basicTableFitsPage = await basicPage.evaluate((element) => {
      const tableBox = element.querySelector(":scope > table").getBoundingClientRect();
      const footerBox = element.querySelector(":scope > footer").getBoundingClientRect();
      return tableBox.bottom + 12 < footerBox.top;
    });
    expect(basicTableFitsPage).toBe(true);

    const personPagesClearFooter = await page
      .locator(".preview-person-page")
      .evaluateAll((pages) =>
        pages.every((element) => {
          const tableBox = element
            .querySelector(":scope > table")
            .getBoundingClientRect();
          const footerBox = element
            .querySelector(":scope > footer")
            .getBoundingClientRect();
          return tableBox.bottom + 12 < footerBox.top;
        }),
    );
    expect(personPagesClearFooter).toBe(true);

    const detailPage = page.locator(".preview-detail-page").first();
    await expect(detailPage.locator(":scope > h3")).toHaveText(
      "三、项目详细内容",
    );
    await expect(
      detailPage.locator(".preview-section-table tr").first().locator("th"),
    ).toHaveText(/^1．立项背景/);

    const submittedPages = page.locator(".preview-submitted-page");
    await expect(submittedPages).toHaveCount(64);
    await expect(
      submittedPages.filter({ has: page.locator("img") }),
    ).toHaveCount(62);
    for (const [sectionKey, expectedPages] of [
      ["unitRecommendation", 2],
      ["expertRecommendation", 1],
      ["attachments", 7],
      ["authenticity", 51],
      ["confidentiality", 2],
      ["integrity", 1],
    ]) {
      await expect(
        page.locator(`.preview-submitted-page[data-section-key="${sectionKey}"]`),
      ).toHaveCount(expectedPages);
    }
    await expect(page.getByText("以本章上传 Word 为准。")).toHaveCount(0);
    const recommendationWordPage = page.locator(
      '.preview-submitted-page[aria-label*="八、申报、推荐单位意见.docx"]',
    );
    await expect(recommendationWordPage).toHaveAttribute(
      "aria-label",
      /八、申报、推荐单位意见\.docx/,
    );
    await recommendationWordPage.screenshot({
      path: "test-results/application-preview-submitted-word.png",
    });
    await expect
      .poll(() =>
        submittedPages.locator("img").evaluateAll((images) =>
          images.every(
            (image) =>
              image.complete &&
              image.naturalWidth > 0 &&
              image.getBoundingClientRect().width > 0,
          ),
        ),
      )
      .toBe(true);
    const ipPage = page.locator(".preview-ip-page").first();
    await expect(ipPage.getByRole("heading", { level: 3 })).toHaveText(
      "五、申请、获得知识产权情况表",
    );
    await expect(ipPage.getByRole("heading", { level: 4 })).toHaveText([
      "1. 知识产权证明目录",
      "2. 技术评价证明及行业审批文件目录",
      "3. 应用单位目录",
    ]);
    await expect(ipPage.getByText("节能技术论著")).toHaveCount(0);
    const evaluationTable = ipPage.getByRole("table", {
      name: "2. 技术评价证明及行业审批文件目录",
    });
    await expect(evaluationTable.locator("thead th")).toHaveText([
      "文件名称",
      "出具单位",
      "出具时间",
      "文件编号",
    ]);
    await expect(evaluationTable).toContainText("评价字第001号");
    await expect(evaluationTable.locator("tbody tr")).toHaveCount(4);
    await expect(
      ipPage
        .getByRole("table", { name: "1. 知识产权证明目录" })
        .locator("tbody tr"),
    ).toHaveCount(5);
    const applicationUnitTable = ipPage.getByRole("table", {
      name: "3. 应用单位目录",
    });
    await expect(applicationUnitTable).toContainText("节能示范有限公司");
    await expect(applicationUnitTable.locator("tbody tr")).toHaveCount(4);
    await ipPage.screenshot({
      path: "test-results/application-preview-ip-page.png",
      style: ".preview-toolbar { visibility: hidden !important; }",
    });
    const economicPreview = page.getByRole("table", { name: "经济效益数据" });
    await expect(
      economicPreview.locator("tbody").first().locator("tr"),
    ).toHaveCount(7);
    await expect(economicPreview).not.toContainText("新增销售额");

    const previewPages = page.locator(".preview-page");
    const previewPageCount = await previewPages.count();
    await expect
      .poll(() =>
        previewPages.evaluateAll((pages) =>
          pages.map(
            (previewPage) =>
              previewPage.querySelector(":scope > .preview-page-number")
                ?.textContent || "",
          ),
        ),
      )
      .toEqual(
        Array.from({ length: previewPageCount }, (_, index) => String(index + 1)),
      );
    for (let index = 0; index < Math.min(previewPageCount, 5); index += 1) {
      await previewPages.nth(index).screenshot({
        path: `test-results/application-preview-page-${index + 1}.png`,
        style: ".preview-toolbar { visibility: hidden !important; }",
      });
    }
    const introductionPageFrames = await page
      .locator(
        '.preview-introduction-page .preview-section-table[aria-label^="二、项目简介"]',
      )
      .evaluateAll((tables) =>
        tables.map((table) => {
          const { width, height } = table.getBoundingClientRect();
          return { width, height };
        }),
      );
    expect(introductionPageFrames.length).toBeGreaterThan(1);
    const referenceFrame = introductionPageFrames[0];
    const referenceRatio = referenceFrame.width / referenceFrame.height;
    expect(
      introductionPageFrames.every(
        ({ width, height }) =>
          Math.abs(width - referenceFrame.width) <= 1 &&
          Math.abs(height - referenceFrame.height) <= 1 &&
          Math.abs(width / height - referenceRatio) <= 0.001,
      ),
    ).toBe(true);
    const overflowingPages = await previewPages.evaluateAll((pages) =>
      pages
        .map((previewPage, index) => ({
          page: index + 1,
          horizontal: previewPage.scrollWidth - previewPage.clientWidth,
          vertical: previewPage.scrollHeight - previewPage.clientHeight,
        }))
        .filter(({ horizontal, vertical }) => horizontal > 1 || vertical > 1),
    );
    expect(overflowingPages).toEqual([]);

    let completeExportPayload;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/pdf-export" &&
        !completeExportPayload
      ) {
        completeExportPayload = request.postDataJSON();
      }
    });
    const exportStartedAt = Date.now();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出 PDF", exact: true }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const pdf = Buffer.concat(chunks);
    expect(Date.now() - exportStartedAt).toBeLessThan(30_000);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(
      completeExportPayload.parts.filter((part) => part.type === "pdf"),
    ).toHaveLength(3);
    expect(
      completeExportPayload.parts
        .filter((part) => part.type === "html")
        .map((part) => part.html)
        .join(""),
    ).not.toContain("data-source-pdf-id");

    const pdfPath = path.join(os.tmpdir(), `ceca-export-${applicationId}.pdf`);
    await fs.writeFile(pdfPath, pdf);
    try {
      const { stdout: pdfInfo } = await execFileAsync("pdfinfo", [pdfPath]);
      const exportedPageCount = Number(
        pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1] || 0,
      );
      expect(exportedPageCount).toBe(previewPageCount);
      const { stdout } = await execFileAsync("pdftotext", [pdfPath, "-"]);
      const textPages = stdout.split("\f");
      const introductionPage = textPages.findIndex((text) =>
        text.includes("项目简介"),
      );
      expect(introductionPage).toBeGreaterThan(-1);
      expect(textPages[introductionPage + 1]).toMatch(
        /项目简介|项目详细内容/,
      );
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
    }

    const independentExportHtml = [];
    await page.route(
      "**/api/pdf-export",
      async (route) => {
        const payload = route.request().postDataJSON();
        independentExportHtml.push(
          payload.html ||
            payload.parts
              .filter((part) => part.type === "html")
              .map((part) => part.html)
              .join(""),
        );
        await route.fulfill({
          status: 200,
          contentType: "application/pdf",
          body: "%PDF-1.4\n%%EOF",
        });
      },
      { times: 4 },
    );
    const independentExports = [
      {
        button: "首页",
        pageMarker: /(?:class="| )preview-basic-page(?: |")/g,
        pageCount: 1,
      },
      {
        button: "完成人",
        pageMarker: /(?:class="| )preview-person-page(?: |")/g,
        pageCount: 2,
      },
      {
        button: "完成单位",
        pageMarker: /(?:class="| )preview-unit-page(?: |")/g,
        pageCount: 2,
      },
      {
        button: "申报推荐单位意见",
        pageMarker: /data-section-key="unitRecommendation"/g,
        pageCount: 2,
      },
    ];
    for (const [index, exportCase] of independentExports.entries()) {
      const button = page
        .getByLabel("独立盖章导出")
        .getByRole("button", { name: exportCase.button, exact: true });
      await button.click();
      await expect.poll(() => independentExportHtml.length).toBe(index + 1);
      await expect(button).toBeEnabled();
      const exportedHtml = independentExportHtml[index];
      expect(
        exportedHtml.match(/(?:class="| )preview-page(?: |")/g) || [],
      ).toHaveLength(exportCase.pageCount);
      expect(exportedHtml.match(exportCase.pageMarker) || []).toHaveLength(
        exportCase.pageCount,
      );
    }
    expect(errors).toEqual([]);
  } finally {
    if (applicationId) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});
