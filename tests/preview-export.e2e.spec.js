import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { jsPDF } from "jspdf";
import {
  completePerson,
  completeProjectData,
  completeUnit,
  tinyPng,
} from "./application-fixtures.mjs";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";
const requiredProjectMaterials = [
  "technical_proof",
  "application_proof",
  "evaluation_report",
  "novelty_report",
  "patent_proof",
  "inventor_id",
  "unit_license",
];

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

test("rich media, entity pages and the complete PDF export stay intact", async ({
  page,
}) => {
  test.setTimeout(120_000);
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

    const signedDocument = new jsPDF();
    signedDocument.text("Signed declaration page 1", 20, 20);
    signedDocument.addPage();
    signedDocument.text("Signed declaration page 2", 20, 20);
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
    const basicTableFitsPage = await basicPage.evaluate((element) => {
      const pageBox = element.getBoundingClientRect();
      const tableBox = element.querySelector(":scope > table").getBoundingClientRect();
      return tableBox.bottom < pageBox.bottom;
    });
    expect(basicTableFitsPage).toBe(true);

    const detailPage = page.locator(".preview-detail-page").first();
    await expect(detailPage.locator(":scope > h3")).toHaveText(
      "三、项目详细内容",
    );
    await expect(
      detailPage.locator(".preview-section-table tr").first().locator("th"),
    ).toHaveText(/^1．立项背景/);

    const submittedPages = page.locator(".preview-submitted-page");
    await expect(submittedPages).toHaveCount(3);
    await expect(submittedPages.nth(0)).toHaveAttribute(
      "data-section-key",
      "unitRecommendation",
    );
    await expect(submittedPages.nth(1)).toHaveAttribute(
      "data-section-key",
      "authenticity",
    );
    await expect(submittedPages.nth(2)).toHaveAttribute(
      "data-section-key",
      "authenticity",
    );
    await expect(page.getByText("以本章上传 Word 为准。")).toHaveCount(0);
    await expect(submittedPages.nth(0)).toHaveAttribute(
      "aria-label",
      /八、申报、推荐单位意见\.docx/,
    );
    await submittedPages.nth(0).screenshot({
      path: "test-results/application-preview-submitted-word.png",
    });
    for (const image of await submittedPages.locator("img").all()) {
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((element) => element.naturalWidth))
        .toBeGreaterThan(0);
    }
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

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出系统生成 PDF" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const pdf = Buffer.concat(chunks);
    const exportedPageCount =
      pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length || 0;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(pdf.length).toBeGreaterThan(100_000);
    expect(exportedPageCount).toBe(previewPageCount);
    expect(errors).toEqual([]);
  } finally {
    if (applicationId) {
      await page.request.delete(`${baseUrl}/api/applications/${applicationId}`);
    }
  }
});
