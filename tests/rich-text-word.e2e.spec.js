import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import JSZip from "jszip";
import {
  extractLegacyWordFields,
  extractWordFields,
  WORD_IMPORT_LIMITS,
  WordImportError,
} from "../lib/word-fields.mjs";
import { createWordImportRouter } from "../routes/word-import.mjs";
import { getRichTextGuidance } from "../src/editor/field-guidance.mjs";
import { WORD_IMPORT_GUIDANCE } from "../src/import/word-guidance.mjs";
import {
  referencedWordImages,
  replaceWordImageSources,
} from "../src/import/word-images.mjs";
import {
  sanitizeApplicationRichTextData,
  sanitizeRichTextHtml,
} from "../src/editor/rich-text-node.mjs";

test("reads split legacy DOC templates without treating blank guidance as user content", async () => {
  const buffer = await fsPromises.readFile(
    path.resolve("节能奖填报材料/科技进步奖/三、项目详细内容.doc"),
  );
  const result = await extractLegacyWordFields(buffer, "三、项目详细内容.doc");
  assert.deepEqual(result.recognized, []);
  assert.equal(result.structure.headingCount, 1);
  assert.match(result.warnings[0], /保存原 Word 文件/);
});

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const packageRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
</w:styles>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>高效余热回收示范项目</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>二、项目简介</w:t></w:r></w:p>
    <w:p><w:r><w:t>本项目通过多级换热降低系统能耗。</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>1. 立项背景</w:t></w:r></w:p>
    <w:p><w:r><w:t>现有生产线存在可回收余热未充分利用的问题。</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>联系人</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>张三</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>联系电话</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>13800000000</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>`;

async function createDocx({
  externalRelationship = false,
  macro = false,
  encrypted = false,
  corrupt = false,
  extraEntries = 0,
  oversizedEntry = false,
  suspiciousCompression = false,
  documentContent = documentXml,
} = {}) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    macro
      ? contentTypes.replace(
          "</Types>",
          '<Override PartName="/word/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>',
        )
      : contentTypes,
  );
  zip.file("_rels/.rels", packageRelationships);
  zip.file("word/document.xml", documentContent);
  zip.file("word/styles.xml", styles);
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${externalRelationship ? '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>' : ""}
</Relationships>`,
  );
  if (macro) zip.file("word/vbaProject.bin", Buffer.from([1, 2, 3, 4]));
  for (let index = 0; index < extraEntries; index += 1)
    zip.file(`word/extra-${index}.xml`, "x");
  if (oversizedEntry)
    zip.file("word/oversized.xml", "x".repeat(20 * 1024 * 1024 + 1));
  if (suspiciousCompression)
    zip.file("word/compression-bomb.xml", "x".repeat(1024 * 1024));
  const output = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  if (corrupt) return output.subarray(0, output.length - 12);
  if (encrypted) {
    for (let offset = 0; offset + 8 <= output.length; offset += 1) {
      const signature = output.readUInt32LE(offset);
      if (signature === 0x04034b50) {
        output.writeUInt16LE(
          output.readUInt16LE(offset + 6) | 0x0001,
          offset + 6,
        );
        break;
      }
    }
  }
  return output;
}

async function startWordImportTestServer(extractFields = extractWordFields) {
  const sandbox = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "ceca-word-import-test-"),
  );
  const temporaryRoot = path.join(sandbox, "uploads");
  const app = express();
  app.use((request, _response, next) => {
    request.user = { id: 7 };
    next();
  });
  app.use(
    "/word-import",
    createWordImportRouter({
      ownsApplication: (applicationId, userId) =>
        applicationId === 42 && userId === 7,
      temporaryRoot,
      extractFields,
    }),
  );
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}/word-import`,
    temporaryRoot,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await fsPromises.rm(sandbox, { recursive: true, force: true });
    },
  };
}

async function uploadDocx(baseUrl, buffer, fileName, signal) {
  const body = new FormData();
  body.append(
    "file",
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    fileName,
  );
  body.append("applicationId", "42");
  return fetch(baseUrl, { method: "POST", body, signal });
}

async function assertTemporaryRootEmpty(temporaryRoot) {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const entries = await fsPromises.readdir(temporaryRoot).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    if (!entries.length) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual(await fsPromises.readdir(temporaryRoot), []);
}

test("extracts title, heading paragraphs and table fields as review candidates", async () => {
  const buffer = await createDocx();
  const fixturePath = path.resolve(
    "tests",
    "fixtures",
    "synthetic-import.docx",
  );
  await fsPromises.mkdir(path.dirname(fixturePath), { recursive: true });
  await fsPromises.writeFile(fixturePath, buffer);

  const result = await extractWordFields(buffer, "synthetic-import.docx");

  assert.deepEqual(result.structure, {
    headingCount: 2,
    paragraphCount: 2,
    tableCount: 1,
    imageCount: 0,
  });
  assert.equal(result.fields.projectName, "高效余热回收示范项目");
  assert.match(result.fields.introduction, /多级换热降低系统能耗/);
  assert.match(result.fields.background, /可回收余热未充分利用/);
  assert.equal(result.fields.contact, "张三");
  assert.equal(result.fields.phone, "13800000000");
  assert.deepEqual(result.matchStats, { matched: 5, supported: 21 });
  assert.ok(
    result.recognized.every(
      (candidate) => candidate.source && candidate.confidence,
    ),
  );
});

test("extracts and deduplicates completed-unit table candidates", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", packageRelationships);
  zip.file("word/styles.xml", styles);
  zip.file("word/_rels/document.xml.rels", packageRelationships);
  zip.file(
    "word/document.xml",
    documentXml.replace(
      /<w:tbl>[\s\S]*?<\/w:tbl>/,
      `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>单位名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>所在地</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>某某单位</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>北京</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>某某单位</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>北京</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
    ),
  );
  const result = await extractWordFields(
    await zip.generateAsync({ type: "nodebuffer" }),
    "units.docx",
  );
  assert.equal(result.fields.units.length, 1);
  assert.equal(result.fields.units[0].name, "某某单位");
});

test("extracts completed intellectual-property chapter tables", async () => {
  const cell = (value) =>
    `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
  const row = (...values) => `<w:tr>${values.map(cell).join("")}</w:tr>`;
  const ipDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>五、申请、获得知识产权情况表</w:t></w:r></w:p>
    <w:tbl>
      ${row("1.知识产权证明目录")}
      ${row("授权（申请）项目名称", "知识产权类别", "国（区）别", "申请号", "授权号")}
      ${row("余热回收控制方法", "发明专利", "中国", "CN202610001", "ZL202610001")}
      ${row("2.技术评价证明及行业审批文件目录")}
      ${row("文件名称", "出具单位", "出具时间", "文件编号")}
      ${row("科技成果评价报告", "中国节能协会", "2026-08", "评价字第001号")}
      ${row("3.应用单位目录")}
      ${row("应用单位名称", "应用起始时间", "联系人及电话", "使用本项目产生的经济效益（万元）")}
      ${row("节能示范有限公司", "2025-01", "李工 13800000000", "860")}
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>`;
  const result = await extractWordFields(
    await createDocx({ documentContent: ipDocument }),
    "五、申请、获得知识产权情况表.docx",
    { sectionKey: "ip" },
  );

  assert.deepEqual(result.fields.ipRecords, [
    {
      name: "余热回收控制方法",
      type: "发明专利",
      country: "中国",
      applicationNumber: "CN202610001",
      authorizationNumber: "ZL202610001",
    },
  ]);
  assert.match(result.fields.technicalEvaluation, /科技成果评价报告/);
  assert.match(result.fields.technicalEvaluation, /评价字第001号/);
  assert.deepEqual(result.fields.applicationUnits, [
    {
      unitName: "节能示范有限公司",
      startDate: "2025-01",
      contactPhone: "李工 13800000000",
      economicBenefit: "860",
    },
  ]);
  assert.equal(result.fields.projectName, undefined);
});

test("does not treat a blank intellectual-property chapter title as a project name", async () => {
  const buffer = await fsPromises.readFile(
    path.resolve(
      "节能奖填报材料/科技进步奖/五、申请、获得知识产权情况表.docx",
    ),
  );
  const result = await extractWordFields(
    buffer,
    "五、申请、获得知识产权情况表.docx",
    { sectionKey: "ip" },
  );

  assert.deepEqual(result.recognized, []);
  assert.equal(result.fields.projectName, undefined);
});

test("keeps merged project and person-detail tables from creating false records", async () => {
  const complexDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>项目名称</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>中文</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>正确项目名称</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
        <w:tc><w:p><w:r><w:t>英文</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Correct project name</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>主要完成人</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>张三、李四</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>主要完成单位</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>甲单位、乙单位</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>联系人</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>赵六</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>授权（申请）项目名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>知识产权类别</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>不应覆盖项目名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>发明专利</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>张三</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>性别</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>男</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>出生年月</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1980.01</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>工作单位</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>甲单位</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>姓名</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>性别</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>民族</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>本人照片</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>单位地址及邮编</w:t></w:r></w:p></w:tc><w:tc/><w:tc/><w:tc/></w:tr>
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>`;
  const result = await extractWordFields(
    await createDocx({ documentContent: complexDocument }),
    "complex-template.docx",
  );

  assert.equal(result.fields.projectName, "正确项目名称");
  assert.equal(result.fields.projectNameEn, "Correct project name");
  assert.equal(result.fields.contact, "赵六");
  assert.deepEqual(
    result.fields.people.map((person) => person.name),
    ["张三", "李四"],
  );
  assert.equal(result.fields.people[0].birthDate, "1980.01");
  assert.equal(result.fields.people[0].workUnit, "甲单位");
  assert.deepEqual(
    result.fields.units.map((unit) => unit.name),
    ["甲单位", "乙单位"],
  );
});

test("keeps fully bold subsection content inside the matching rich-text field", async () => {
  const boldRun = (text) =>
    `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const boldSectionDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>粗体正文测试项目</w:t></w:r></w:p>
    ${boldRun("2. 详细技术内容或科学研究内容")}
    ${boldRun("（1）技术原理")}
    ${boldRun("采用源网荷储协同控制技术实现秒级调节。")}
    ${boldRun("（2）研发过程")}
    ${boldRun("经过技术攻关、示范验证和规模化推广三个阶段。")}
    ${boldRun("3. 主要发现点或技术发明点或技术创新点")}
    ${boldRun("创新点1：提出分布式资源群调群控方法。")}
    ${boldRun("创新点2：实现光伏出力秒级精准调节。")}
    ${boldRun("4. 与当前国内外同类技术的比较")}
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>对比维度</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>本项目</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>响应时间</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>秒级</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>技术水平达到国际领先水平。</w:t></w:r></w:p>
    ${boldRun("5. 应用情况")}
    <w:p><w:r><w:t>成果已在多个示范区推广应用。</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;
  const result = await extractWordFields(
    await createDocx({ documentContent: boldSectionDocument }),
    "bold-sections.docx",
  );

  assert.match(result.fields.technicalContent, /源网荷储协同控制/);
  assert.match(result.fields.technicalContent, /示范验证和规模化推广/);
  assert.match(result.fields.innovations, /群调群控/);
  assert.match(result.fields.innovations, /秒级精准调节/);
  assert.match(result.fields.comparison, /响应时间/);
  assert.match(result.fields.comparison, /国际领先水平/);
  assert.match(result.fields.application, /多个示范区/);
});

test("preserves supported DOCX images at their rich-text position", async () => {
  const imageContentTypes = contentTypes.replace(
    "</Types>",
    '<Default Extension="png" ContentType="image/png"/></Types>',
  );
  const imageRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;
  const imageDocument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>图片导入测试项目</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>项目简介</w:t></w:r></w:p>
    <w:p><w:r><w:t>图片前文字</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="9525" cy="9525"/><wp:docPr id="1" name="image1.png"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="image1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:r><w:t>图片后文字</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", imageContentTypes);
  zip.file("_rels/.rels", packageRelationships);
  zip.file("word/document.xml", imageDocument);
  zip.file("word/styles.xml", styles);
  zip.file("word/_rels/document.xml.rels", imageRelationships);
  zip.file(
    "word/media/image1.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  );

  const result = await extractWordFields(
    await zip.generateAsync({ type: "nodebuffer" }),
    "image.docx",
  );
  const introduction = result.recognized.find(
    (candidate) => candidate.key === "introduction",
  );

  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].contentType, "image/png");
  assert.equal(result.structure.imageCount, 1);
  assert.match(introduction.value, /图片前文字/);
  assert.match(introduction.value, /<img src="\/api\/word-import\/image\//);
  assert.match(introduction.value, /图片后文字/);
  assert.deepEqual(referencedWordImages([introduction], result.images), [
    result.images[0],
  ]);
  const persistedSource = "/api/applications/42/files/7/download?inline=1";
  const replaced = replaceWordImageSources(
    introduction.value,
    new Map([[result.images[0].placeholder, persistedSource]]),
  );
  assert.match(replaced, new RegExp(persistedSource.replaceAll("?", "\\?")));
  assert.doesNotMatch(replaced, /\/api\/word-import\/image\//);
});

test("rejects each unsafe DOCX archive class with a distinct code", async () => {
  await assert.rejects(
    extractWordFields(await createDocx({ macro: true }), "macro.docx"),
    (error) =>
      error instanceof WordImportError && error.code === "macro_document",
  );
  await assert.rejects(
    extractWordFields(
      await createDocx({ externalRelationship: true }),
      "external.docx",
    ),
    (error) =>
      error instanceof WordImportError &&
      error.code === "external_relationship",
  );
  await assert.rejects(
    extractWordFields(await createDocx({ encrypted: true }), "encrypted.docx"),
    (error) =>
      error instanceof WordImportError && error.code === "encrypted_document",
  );
  await assert.rejects(
    extractWordFields(await createDocx({ corrupt: true }), "corrupt.docx"),
    (error) =>
      error instanceof WordImportError && error.code === "invalid_archive",
  );
  await assert.rejects(
    extractWordFields(
      await createDocx({ suspiciousCompression: true }),
      "suspicious.docx",
    ),
    (error) =>
      error instanceof WordImportError && error.code === "suspicious_archive",
  );
  await assert.rejects(
    extractWordFields(
      await createDocx({ extraEntries: 2001 }),
      "too-many.docx",
    ),
    (error) =>
      error instanceof WordImportError &&
      error.code === "archive_limit_exceeded",
  );
  await assert.rejects(
    extractWordFields(
      await createDocx({ oversizedEntry: true }),
      "oversized.docx",
    ),
    (error) =>
      error instanceof WordImportError &&
      error.code === "archive_limit_exceeded",
  );
  const oversizedFile = Buffer.alloc(WORD_IMPORT_LIMITS.maxFileBytes + 1);
  oversizedFile.writeUInt32LE(0x04034b50, 0);
  await assert.rejects(
    extractWordFields(oversizedFile, "oversized-file.docx"),
    (error) =>
      error instanceof WordImportError && error.code === "document_too_large",
  );
  await assert.rejects(
    extractWordFields(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      "password-protected.docx",
    ),
    (error) =>
      error instanceof WordImportError && error.code === "encrypted_document",
  );
});

test("cleans request-scoped temporary files after success and rejection", async () => {
  const testServer = await startWordImportTestServer();
  try {
    const accepted = await uploadDocx(
      testServer.baseUrl,
      await createDocx(),
      "valid.docx",
    );
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).ok, true);
    await assertTemporaryRootEmpty(testServer.temporaryRoot);

    const rejected = await uploadDocx(
      testServer.baseUrl,
      await createDocx({ macro: true }),
      "macro.docx",
    );
    assert.equal(rejected.status, 422);
    const payload = await rejected.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.code, "macro_document");
    await assertTemporaryRootEmpty(testServer.temporaryRoot);

    const invalidLegacyDocument = await uploadDocx(
      testServer.baseUrl,
      await createDocx(),
      "legacy.doc",
    );
    assert.equal(invalidLegacyDocument.status, 422);
    assert.equal((await invalidLegacyDocument.json()).code, "invalid_document");
    await assertTemporaryRootEmpty(testServer.temporaryRoot);

    const oversizedUpload = Buffer.alloc(WORD_IMPORT_LIMITS.maxFileBytes + 1);
    const tooLarge = await uploadDocx(
      testServer.baseUrl,
      oversizedUpload,
      "too-large.docx",
    );
    assert.equal(tooLarge.status, 422);
    assert.equal((await tooLarge.json()).code, "document_too_large");
    await assertTemporaryRootEmpty(testServer.temporaryRoot);
  } finally {
    await testServer.close();
  }
});

test("cleans request-scoped temporary files when the client cancels parsing", async () => {
  let notifyExtractionStarted;
  const extractionStarted = new Promise((resolve) => {
    notifyExtractionStarted = resolve;
  });
  const delayedExtractor = async (buffer, fileName) => {
    notifyExtractionStarted();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return extractWordFields(buffer, fileName);
  };
  const testServer = await startWordImportTestServer(delayedExtractor);
  try {
    const controller = new AbortController();
    const upload = uploadDocx(
      testServer.baseUrl,
      await createDocx(),
      "cancelled.docx",
      controller.signal,
    );
    await extractionStarted;
    controller.abort();
    await assert.rejects(upload, (error) => error.name === "AbortError");
    await assertTemporaryRootEmpty(testServer.temporaryRoot);
  } finally {
    await testServer.close();
  }
});

test("uses the canonical tag, attribute, CSS and URL allowlist for rich text", () => {
  const source = `
    <h2 onclick="attack()" style="font-family: Arial; font-size: 14px; color: #123456; text-align: center; position: fixed; background-image: url(javascript:attack)">
      <strong>safe</strong><script>alert(1)</script><iframe src="https://evil.example">frame</iframe>
      <a href="javascript:alert(1)" onclick="attack()">bad-js</a>
      <a href="data:text/html,bad">bad-data</a>
      <a href="//evil.example/path">bad-relative</a>
      <a href="https://example.com/path" target="_blank">https</a>
      <a href="http://example.com/path">http</a>
      <a href="mailto:test@example.com">mail</a>
      <a href="/application/1">root</a>
      <a href="#section">fragment</a>
      <img src="https://example.com/image.png" alt="preview" title="image" width="320" srcset="bad" onerror="attack()">
      <img src="data:image/png;base64,bad" alt="bad-image">
      <table style="border-collapse: collapse; width: 100%; behavior: url(bad)">
        <tbody><tr><td colspan="2" data-colwidth="120" data-secret="bad" style="border: 1px solid #123456; padding: 4px 6px; vertical-align: top">cell</td></tr></tbody>
      </table>
      <object data="https://evil.example">object</object><form><input value="bad"></form>
    </h2>`;

  const sanitized = sanitizeRichTextHtml(source);

  assert.match(sanitized, /<h2 style="[^"]*font-family:\s*Arial/);
  assert.match(sanitized, /font-size:\s*14px/);
  assert.match(sanitized, /color:\s*#123456/);
  assert.match(sanitized, /text-align:\s*center/);
  assert.match(
    sanitized,
    /href="https:\/\/example\.com\/path" target="_blank" rel="noopener noreferrer"/,
  );
  assert.match(sanitized, /href="http:\/\/example\.com\/path"/);
  assert.match(sanitized, /href="mailto:test@example\.com"/);
  assert.match(sanitized, /href="\/application\/1"/);
  assert.match(sanitized, /href="#section"/);
  assert.match(
    sanitized,
    /<img src="https:\/\/example\.com\/image\.png" alt="preview" title="image" width="320" \/>/,
  );
  assert.match(
    sanitized,
    /<td colspan="2" data-colwidth="120" style="[^"]*border:\s*1px solid #123456/,
  );
  assert.match(sanitized, /padding:\s*4px 6px/);
  assert.match(sanitized, /vertical-align:\s*top/);

  for (const unsafeToken of [
    "<script",
    "<iframe",
    "<object",
    "<form",
    "<input",
    "onclick",
    "onerror",
    "srcset",
    "data-secret",
    "javascript:",
    "data:image",
    "//evil.example",
    "position:",
    "background-image",
    "behavior:",
  ]) {
    assert.ok(!sanitized.includes(unsafeToken), `removed ${unsafeToken}`);
  }
});

test("sanitizes only application rich-text fields before server persistence", () => {
  const source = {
    projectName: "<b>plain project name stays literal</b>",
    contact: "<script>plain contact stays literal</script>",
    introduction:
      '<p onclick="bad()">Intro <a href="javascript:bad()">link</a></p>',
    peopleCooperation:
      '<p style="font-size: 14px; position: fixed">Cooperation</p>',
    people: [
      {
        name: "Person A",
        contribution:
          '<p><img src="data:image/png;base64,bad" onerror="bad()">Contribution</p>',
      },
      "legacy person value",
    ],
    units: [
      {
        name: "Unit A",
        contribution:
          '<p style="text-align: center; display: none">Unit contribution</p>',
      },
    ],
    applicationUnits: [{ name: "<b>ordinary record remains unchanged</b>" }],
  };

  const sanitized = sanitizeApplicationRichTextData(source);

  assert.equal(sanitized.projectName, source.projectName);
  assert.equal(sanitized.contact, source.contact);
  assert.deepEqual(sanitized.applicationUnits, source.applicationUnits);
  assert.equal(sanitized.introduction, "<p>Intro <a>link</a></p>");
  assert.equal(
    sanitized.peopleCooperation,
    '<p style="font-size:14px">Cooperation</p>',
  );
  assert.equal(sanitized.people[0].contribution, "<p><img />Contribution</p>");
  assert.equal(sanitized.people[1], "legacy person value");
  assert.equal(
    sanitized.units[0].contribution,
    '<p style="text-align:center">Unit contribution</p>',
  );
  assert.match(source.introduction, /onclick/);
  assert.match(source.people[0].contribution, /data:image/);
});

test("maps every A rich-text editor to official-template guidance without data fields", () => {
  const fieldKeys = [
    "introduction",
    "background",
    "technicalContent",
    "innovations",
    "comparison",
    "application",
    "economic",
    "social",
    "technicalEvaluation",
    "person-1-contribution",
    "unit-1-contribution",
  ];
  for (const fieldKey of fieldKeys) {
    const guidance = getRichTextGuidance(fieldKey);
    assert.ok(guidance, `missing guidance for ${fieldKey}`);
    assert.ok(guidance.text);
  }
  assert.equal(getRichTextGuidance("unknown-field"), null);
  assert.equal(getRichTextGuidance("peopleCooperation"), null);
  assert.match(getRichTextGuidance("introduction").text, /核心科技内容/);
  assert.match(getRichTextGuidance("comparison").text, /两页/);
  assert.equal(getRichTextGuidance("unit-1-contribution").max, 500);
  assert.doesNotMatch(
    JSON.stringify(getRichTextGuidance("introduction")),
    /依据|章节用途|格式/,
  );
});

test("keeps Word import guidance as UI-only reference text", () => {
  assert.match(WORD_IMPORT_GUIDANCE, /填写表格请认真参考填写说明/);
  assert.match(WORD_IMPORT_GUIDANCE, /图片粘贴形式/);
  assert.doesNotMatch(WORD_IMPORT_GUIDANCE, /依据|章节用途|候选字段/);
});
