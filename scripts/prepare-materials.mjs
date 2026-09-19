import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

const execFileAsync = promisify(execFile);

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDirectory = path.resolve(root, "..");
const materialsDirectory = path.join(root, "节能奖填报材料");
const sourceDocument = path.join(
  sourceDirectory,
  "附件2.中国节能协会创新奖申报书.doc",
);
const libreOfficeCandidates = [
  process.env.LIBREOFFICE_PATH,
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  "soffice",
].filter(Boolean);

const referenceFiles = [
  "中国节能协会关于开展2026年度”中国节能协会创新奖“申报工作的通知-1.PDF",
  "附件1.中国节能协会创新奖奖励办法（2026修订版）-1.pdf",
  "附件2.中国节能协会创新奖申报书.doc",
  "附件3.中国节能协会创新奖申报书填写说明-1.pdf",
];

const projectChapters = [
  ["科技进步奖", "一、项目基本情况.docx", "一、项目基本情况"],
  ["科技进步奖", "二、项目简介.docx", "二、项目简介"],
  ["科技进步奖", "三、项目详细内容.docx", "三、项目详细内容"],
  ["科技进步奖", "四、本项目曾获奖励情况.docx", "四、本项目曾获奖励情况"],
  ["科技进步奖", "五、申请、获得知识产权情况表.docx", "五、申请、获得知识产权情况表"],
  ["科技进步奖", "六、主要完成人情况表.docx", "六、主要完成人情况表"],
  ["科技进步奖", "七、主要完成单位情况表.docx", "七、主要完成单位情况表"],
  ["科技进步奖", "八、申报、推荐单位意见.docx", "八、申报、推荐单位意见"],
  ["科技进步奖", "九、专家推荐意见.docx", "九、专家推荐意见"],
  ["科技进步奖", "十、附件目录.docx", "十、附件目录"],
  ["科技进步奖", "十一、真实性承诺书.docx", "真实性承诺书"],
  ["科技进步奖", "十二、不涉密承诺函.docx", "十二、不涉密承诺函"],
  ["科技进步奖", "十三、诚信承诺书.docx", "十三、诚信承诺书"],
];

const achievementChapters = [
  ["科技成就奖", "一、基本情况.doc", "一、基本情况"],
  ["科技成就奖", "二、所获与节能减排相关科技奖励和荣誉称号情况.doc", "二、所获与节能减排相关科技奖励和荣誉称号情况"],
  ["科技成就奖", "三、发表节能减排相关论文和专著情况.doc", "三、发表节能减排相关论文和专著情况"],
  ["科技成就奖", "四、所获知识产权证书.doc", "四、所获知识产权证书"],
  ["科技成就奖", "五、承担节能减排相关的科研项目情况.doc", "五、承担节能减排相关的科研项目情况"],
  ["科技成就奖", "六、参与节能减排相关的重大工程技术项目情况.doc", "六、参与节能减排相关的重大工程技术项目情况"],
  ["科技成就奖", "七、与节能减排相关的科技成果转化及推广情况.doc", "七、与节能减排相关的科技成果转化及推广情况"],
  ["科技成就奖", "八、附件.doc", "八、附件"],
  ["科技成就奖", "九、真实性承诺书.doc", "真实性承诺书"],
  ["科技成就奖", "十、诚信承诺书.doc", "诚信承诺书"],
];

async function copyOfficialMaterials() {
  await fs.mkdir(materialsDirectory, { recursive: true });
  for (const fileName of referenceFiles) {
    await fs.copyFile(
      path.join(sourceDirectory, fileName),
      path.join(materialsDirectory, fileName),
    );
  }
}

async function findLibreOffice() {
  for (const candidate of libreOfficeCandidates) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return candidate;
    if (!path.isAbsolute(candidate)) return candidate;
  }
  throw new Error(
    "未找到 LibreOffice。请安装 LibreOffice 或设置 LIBREOFFICE_PATH 后重试",
  );
}

function normalizeText(xml) {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1])
    .join("")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/[\s ]/g, "")
    .replaceAll("．", "、")
    .replaceAll(".", "、");
}

function assertValidXml(xml, fileName) {
  const errors = [];
  new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    },
  }).parseFromString(xml, "application/xml");
  if (errors.length > 0) {
    throw new Error(`${fileName} 包含无效 XML：${errors.join("; ")}`);
  }
}

function findChapterRanges(blocks, chapters, startAt = 0) {
  let cursor = startAt;
  const starts = chapters.map(([, , heading]) => {
    const expected = normalizeText(`<w:t>${heading}</w:t>`);
    const index = blocks.findIndex(
      (block, blockIndex) =>
        blockIndex >= cursor && normalizeText(block).startsWith(expected),
    );
    if (index < 0) throw new Error(`无法在正式申报书中定位章节：${heading}`);
    cursor = index + 1;
    return index;
  });
  return starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? blocks.length,
  }));
}

async function convertWithLibreOffice(
  libreOffice,
  input,
  outputDirectory,
  format,
) {
  const profile = path
    .join(os.tmpdir(), `ceca-materials-${Date.now()}-${Math.random()}`)
    .replaceAll("\\", "/");
  await execFileAsync(
    libreOffice,
    [
      `-env:UserInstallation=file:///${profile}`,
      "--headless",
      "--convert-to",
      format,
      "--outdir",
      outputDirectory,
      input,
    ],
    { windowsHide: true, timeout: 120_000 },
  );
}

async function createChapterDocuments() {
  const libreOffice = await findLibreOffice();
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "ceca-materials-"),
  );
  try {
    await convertWithLibreOffice(
      libreOffice,
      sourceDocument,
      temporaryDirectory,
      "docx:Office Open XML Text",
    );
    const convertedDocument = path.join(
      temporaryDirectory,
      `${path.parse(sourceDocument).name}.docx`,
    );
    const sourceBuffer = await fs.readFile(convertedDocument);
    const sourceZip = await JSZip.loadAsync(sourceBuffer);
    const documentXml = await sourceZip.file("word/document.xml").async("string");
    const bodyStart = documentXml.indexOf("<w:body");
    const bodyOpenEnd = documentXml.indexOf(">", bodyStart) + 1;
    const bodyClose = documentXml.indexOf("</w:body>", bodyOpenEnd);
    const bodyXml = documentXml.slice(bodyOpenEnd, bodyClose);
    const blocks = [
      ...bodyXml.matchAll(/<w:(p|tbl)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>/g),
    ].map((match) => match[0]);
    const sectionProperties = bodyXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] || "";
    const projectRanges = findChapterRanges(blocks, projectChapters);
    const [achievementFirstRange] = findChapterRanges(
      blocks,
      achievementChapters.slice(0, 1),
      projectRanges.at(-1).start + 1,
    );
    projectRanges.at(-1).end = achievementFirstRange.start;

    for (const [chapters, ranges] of [[projectChapters, projectRanges]]) {
      for (let index = 0; index < chapters.length; index += 1) {
        const [folder, fileName] = chapters[index];
        const { start, end } = ranges[index];
        const chapterZip = await JSZip.loadAsync(sourceBuffer);
        const chapterXml = `${documentXml.slice(0, bodyOpenEnd)}${blocks
          .slice(start, end)
          .join("")}${sectionProperties}${documentXml.slice(bodyClose)}`;
        assertValidXml(chapterXml, fileName);
        chapterZip.file("word/document.xml", chapterXml);
        const temporaryDocx = path.join(
          temporaryDirectory,
          `${folder}-${String(index + 1).padStart(2, "0")}.docx`,
        );
        const targetDirectory = path.join(materialsDirectory, folder);
        await fs.mkdir(targetDirectory, { recursive: true });
        await fs.writeFile(
          path.join(targetDirectory, fileName),
          await chapterZip.generateAsync({ type: "nodebuffer" }),
        );
      }
    }

    const progressDirectory = path.join(materialsDirectory, "科技进步奖");
    const inventionDirectory = path.join(materialsDirectory, "技术发明奖");
    const achievementDirectory = path.join(materialsDirectory, "科技成就奖");
    await fs.mkdir(inventionDirectory, { recursive: true });
    await fs.mkdir(achievementDirectory, { recursive: true });
    for (const [, fileName] of projectChapters) {
      await fs.copyFile(
        path.join(progressDirectory, fileName),
        path.join(inventionDirectory, fileName),
      );
    }
    // The official legacy source stores several achievement sections in text
    // boxes that cannot be split reliably without changing their layout.
    for (const [, fileName] of achievementChapters) {
      await fs.copyFile(
        sourceDocument,
        path.join(achievementDirectory, fileName),
      );
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function validateOfficialDocument() {
  const buffer = await fs.readFile(sourceDocument);
  if (buffer.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") {
    throw new Error("正式申报书不是有效的旧版 Word 文档");
  }

}

await validateOfficialDocument();
await copyOfficialMaterials();
await createChapterDocuments();
console.log(`申报资料已准备到：${materialsDirectory}`);