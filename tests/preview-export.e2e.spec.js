import { expect, test } from "@playwright/test";
import { deflateSync } from "node:zlib";
import {
  completePerson,
  completeProjectData,
  completeUnit,
  tinyPng,
} from "./application-fixtures.mjs";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

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

    const seedResponse = await page.request.put(
      `${baseUrl}/api/applications/${applicationId}`,
      {
        data: {
          data: completeProjectData(title, {
            technicalContent: richContent,
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

    for (const category of ["recommendation_signed", "application"]) {
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
    await expect(richPage.locator("table")).toContainText("图片与表格");
    await expect(richPage.locator("table")).toContainText("通过");

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
      await expect(unitTable.locator("xpath=ancestor::article")).toHaveCount(1);
    }

    const previewPages = page.locator(".preview-page");
    const previewPageCount = await previewPages.count();
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
