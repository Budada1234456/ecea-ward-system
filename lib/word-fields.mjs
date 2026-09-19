import JSZip from "jszip";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import sanitizeHtml from "sanitize-html";
import { DomUtils, parseDocument } from "htmlparser2";
import { createHash } from "node:crypto";
import { sanitizeRichTextHtml } from "../src/editor/rich-text-node.mjs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_COUNT = 2_000;
const MAX_COMPRESSION_RATIO = 100;
const MAX_WORD_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_WORD_IMAGE_TOTAL_BYTES = 15 * 1024 * 1024;
const MAX_WORD_IMAGE_COUNT = 20;
const WORD_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
]);

const RICH_FIELDS = new Set([
  "introduction",
  "background",
  "technicalContent",
  "innovations",
  "comparison",
  "application",
  "economic",
  "social",
  "technicalEvaluation",
  "recommendation",
  "transformation",
  "workSummary",
  "resume",
]);

const FIELD_DEFINITIONS = [
  { key: "projectName", field: "项目名称", aliases: ["项目名称", "成果名称"] },
  {
    key: "projectNameEn",
    field: "项目名称（英文）",
    aliases: ["项目英文名称", "英文名称"],
  },
  {
    key: "applicantUnit",
    field: "第一申报单位",
    aliases: ["第一申报单位", "申报单位"],
  },
  { key: "contact", field: "联系人", aliases: ["联系人", "项目联系人"] },
  {
    key: "phone",
    field: "联系电话",
    aliases: ["联系电话", "联系人电话", "电话"],
  },
  {
    key: "email",
    field: "电子邮箱",
    aliases: ["电子邮箱", "联系邮箱", "邮箱"],
  },
  { key: "introduction", field: "项目简介", aliases: ["项目简介", "项目概况"] },
  { key: "background", field: "立项背景", aliases: ["立项背景", "项目背景"] },
  {
    key: "technicalContent",
    field: "主要技术内容",
    aliases: ["主要技术内容", "详细技术内容", "技术内容"],
  },
  {
    key: "innovations",
    field: "主要技术创新点",
    aliases: [
      "主要技术创新点",
      "主要发现点或技术发明点或技术创新点",
      "技术创新点",
      "创新点",
    ],
  },
  {
    key: "comparison",
    field: "同类技术比较",
    aliases: [
      "同类技术比较",
      "国内外同类技术比较",
      "与当前国内外同类技术的比较",
      "技术比较",
    ],
  },
  {
    key: "application",
    field: "应用情况",
    aliases: ["应用情况", "推广应用情况", "应用及推广"],
  },
  { key: "economic", field: "经济效益", aliases: ["经济效益"] },
  { key: "social", field: "社会效益", aliases: ["社会效益"] },
  {
    key: "technicalEvaluation",
    field: "技术评价",
    aliases: ["技术评价", "评价结论"],
  },
  {
    key: "recommendation",
    field: "申报、推荐单位意见",
    aliases: ["申报推荐单位意见", "推荐单位意见", "申报单位意见"],
  },
  {
    key: "transformation",
    field: "科技成果转化及推广情况",
    aliases: [
      "科技成果转化及推广情况",
      "与节能减排相关的科技成果转化及推广情况",
    ],
  },
  {
    key: "workSummary",
    field: "节能减排相关工作总结",
    aliases: ["节能减排相关工作总结"],
  },
  {
    key: "resume",
    field: "本人简历",
    aliases: ["本人简历", "本人简历（从高校填起）"],
  },
  { key: "people", field: "主要完成人", aliases: ["主要完成人", "完成人"] },
  {
    key: "units",
    field: "主要完成单位",
    aliases: ["主要完成单位", "完成单位"],
  },
];

const PERSON_FIELD_ALIASES = {
  name: ["姓名"],
  gender: ["性别"],
  rank: ["排名"],
  birthDate: ["出生年月", "出生日期"],
  birthPlace: ["出生地"],
  ethnicity: ["民族"],
  nativePlace: ["籍贯"],
  idNumber: ["身份证号", "身份证号码"],
  politicalAffiliation: ["党派", "政治面貌"],
  nationality: ["国籍"],
  administrativePosition: ["行政职务"],
  returnee: ["归国人员"],
  returnDate: ["归国时间"],
  workUnit: ["工作单位", "工作单位全称"],
  officePhone: ["办公电话", "单位电话"],
  mailingAddress: ["通讯地址", "单位地址"],
  postalCode: ["邮政编码", "邮编"],
  homeAddress: ["家庭住址"],
  homePhone: ["住宅电话"],
  email: ["电子邮箱", "电子信箱", "E-mail"],
  mobilePhone: ["移动电话", "手机号码"],
  graduateSchool: ["毕业学校"],
  graduationDate: ["毕业时间"],
  education: ["文化程度", "学历"],
  technicalTitle: ["技术职称", "专业技术职务"],
  specialty: ["专业、专长", "专业专长"],
  highestDegree: ["最高学位", "学位"],
  awards: ["曾获奖励及荣誉称号情况", "曾获奖励"],
  projectPeriod: ["参加本项目的起止时间", "参加本项目起止时间"],
  notes: ["备注"],
};

const UNIT_FIELD_ALIASES = {
  name: ["单位名称"],
  location: ["所在地", "所在地区"],
  rank: ["排名"],
  nature: ["单位性质"],
  contact: ["联系人"],
  phone: ["联系电话", "办公电话"],
  mobilePhone: ["移动电话", "手机号码"],
  address: ["通讯地址", "单位地址"],
  postalCode: ["邮政编码", "邮编"],
  email: ["电子邮箱", "电子信箱", "E-mail"],
  fax: ["传真"],
};

const CHAPTER_TABLE_DEFINITIONS = {
  ipRecords: {
    key: "ipRecords",
    field: "知识产权证明目录",
  },
  applicationUnits: {
    key: "applicationUnits",
    field: "应用单位目录",
  },
};

export class WordImportError extends Error {
  constructor(message, code = "invalid_docx") {
    super(message);
    this.name = "WordImportError";
    this.code = code;
  }
}

function normalizeLabel(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/^[\s一二三四五六七八九十0-9（()）.、章节]+/u, "")
    .replace(/[\s：:；;，,。．·\-—_（）()]/gu, "")
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function firstDocxParagraphText(documentXml) {
  const paragraph =
    String(documentXml || "").match(/<w:p\b[\s\S]*?<\/w:p>/i)?.[0] || "";
  return cleanText(
    [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
      .map((match) => decodeXmlText(match[1]))
      .join(""),
  );
}

function definitionForLabel(label) {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  return (
    FIELD_DEFINITIONS.find((definition) =>
      definition.aliases.some((alias) => {
        const candidate = normalizeLabel(alias);
        return normalized === candidate;
      }),
    ) || null
  );
}

function definitionForSectionLabel(label) {
  const normalized = normalizeLabel(label);
  if (normalized.includes(normalizeLabel("主要研究内容")))
    return FIELD_DEFINITIONS.find(
      (definition) => definition.key === "technicalContent",
    );
  return (
    FIELD_DEFINITIONS.find(
      (definition) =>
        RICH_FIELDS.has(definition.key) &&
        definition.aliases.some((alias) => {
          const candidate = normalizeLabel(alias);
          return normalized === candidate || normalized.startsWith(candidate);
        }),
    ) || definitionForLabel(label)
  );
}

function fieldKeyForLabel(label, aliases) {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  return (
    Object.entries(aliases).find(([, labels]) =>
      labels.some((candidate) => normalizeLabel(candidate) === normalized),
    )?.[0] || null
  );
}

function isRecordFieldLabel(label) {
  return Boolean(
    fieldKeyForLabel(label, PERSON_FIELD_ALIASES) ||
    fieldKeyForLabel(label, UNIT_FIELD_ALIASES),
  );
}

function splitEntityNames(value) {
  return cleanText(value)
    .split(/[、,，;；\n]+/u)
    .map((name) => cleanText(name))
    .filter(Boolean);
}

function normalizeRank(value) {
  return String(value || "").match(/\d+/u)?.[0] || cleanText(value);
}

function cleanApplicantUnit(value) {
  return cleanText(value).replace(/^盖章\s*/u, "");
}

function tableRowsFromNode(tableNode) {
  return DomUtils.findAll(
    (child) => child.type === "tag" && child.name === "tr",
    tableNode.children,
  )
    .map((row) =>
      (row.children || [])
        .filter(
          (child) =>
            child.type === "tag" &&
            (child.name === "td" || child.name === "th"),
        )
        .map((cell) => cleanText(DomUtils.textContent(cell))),
    )
    .filter((row) => row.some(Boolean));
}

function addChapterTableRecords(candidates, definition, records, source) {
  const populated = records.filter((record) =>
    Object.values(record).some((value) => cleanText(value)),
  );
  if (!populated.length) return;
  candidates.set(definition.key, {
    key: definition.key,
    field: definition.field,
    value: populated,
    source,
    confidence: 0.97,
  });
}

function extractIpChapterCandidates(candidates, rows) {
  const sectionIndexes = rows.reduce((indexes, row, index) => {
    const label = normalizeLabel(row.join(""));
    if (label.includes(normalizeLabel("知识产权证明目录"))) indexes.ip = index;
    if (label.includes(normalizeLabel("技术评价证明及行业审批文件目录")))
      indexes.evaluation = index;
    if (label.includes(normalizeLabel("应用单位目录"))) indexes.units = index;
    return indexes;
  }, {});
  if (
    !Number.isInteger(sectionIndexes.ip) ||
    !Number.isInteger(sectionIndexes.evaluation) ||
    !Number.isInteger(sectionIndexes.units)
  )
    return;

  const ipRecords = rows
    .slice(sectionIndexes.ip + 2, sectionIndexes.evaluation)
    .map(([name, type, country, applicationNumber, authorizationNumber]) => ({
      name: cleanText(name),
      type: cleanText(type),
      country: cleanText(country),
      applicationNumber: cleanText(applicationNumber),
      authorizationNumber: cleanText(authorizationNumber),
    }));
  addChapterTableRecords(
    candidates,
    CHAPTER_TABLE_DEFINITIONS.ipRecords,
    ipRecords,
    "知识产权证明目录表",
  );

  const evaluationRows = rows.slice(
    sectionIndexes.evaluation + 1,
    sectionIndexes.units,
  );
  if (
    evaluationRows
      .slice(1)
      .some((row) => row.some((value) => cleanText(value)))
  ) {
    const contentRows = evaluationRows
      .map(
        (row) =>
          `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`,
      )
      .join("");
    addCandidate(
      candidates,
      FIELD_DEFINITIONS.find(
        (definition) => definition.key === "technicalEvaluation",
      ),
      `<table>${contentRows}</table>`,
      "技术评价证明及行业审批文件目录表",
      0.97,
    );
  }

  const applicationUnits = rows
    .slice(sectionIndexes.units + 2)
    .map(([unitName, startDate, contactPhone, economicBenefit]) => ({
      unitName: cleanText(unitName),
      startDate: cleanText(startDate),
      contactPhone: cleanText(contactPhone),
      economicBenefit: cleanText(economicBenefit),
    }));
  addChapterTableRecords(
    candidates,
    CHAPTER_TABLE_DEFINITIONS.applicationUnits,
    applicationUnits,
    "应用单位目录表",
  );
}

function isProjectBasicTable(rows) {
  const labels = rows.flat().map(normalizeLabel);
  const markers = [
    "项目名称",
    "主要完成人",
    "主要完成单位",
    "第一申报单位",
  ].map(normalizeLabel);
  return (
    labels.includes(normalizeLabel("项目名称")) &&
    markers.filter((marker) => labels.includes(marker)).length >= 2
  );
}

function isSimpleProjectFieldTable(rows) {
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.length === 2 &&
        Boolean(definitionForLabel(row[0])) &&
        !["people", "units"].includes(definitionForLabel(row[0]).key),
    )
  );
}

function extractProjectTableCandidates(candidates, rows) {
  let projectNameContext = false;
  for (const row of rows) {
    const firstLabel = normalizeLabel(row[0]);
    if (firstLabel === normalizeLabel("项目名称")) {
      projectNameContext = true;
      const isChineseRow = normalizeLabel(row[1]) === normalizeLabel("中文");
      const value = isChineseRow ? row[2] : row[1];
      addCandidate(
        candidates,
        FIELD_DEFINITIONS.find(
          (definition) => definition.key === "projectName",
        ),
        value,
        "项目基本情况表",
        0.97,
      );
      continue;
    }
    if (projectNameContext && firstLabel === normalizeLabel("英文") && row[1]) {
      addCandidate(
        candidates,
        FIELD_DEFINITIONS.find(
          (definition) => definition.key === "projectNameEn",
        ),
        row[1],
        "项目基本情况表英文名称",
        0.97,
      );
      continue;
    }

    for (let cellIndex = 0; cellIndex < row.length - 1; cellIndex += 1) {
      const definition = definitionForLabel(row[cellIndex]);
      if (
        !definition ||
        ["projectName", "projectNameEn"].includes(definition.key)
      )
        continue;
      const value = row[cellIndex + 1];
      if (!value || definitionForLabel(value)) continue;
      if (definition.key === "people") {
        addCandidate(
          candidates,
          definition,
          splitEntityNames(value).map((name) => ({ name })),
          "项目基本情况表主要完成人",
          0.91,
        );
        continue;
      }
      if (definition.key === "units") {
        addCandidate(
          candidates,
          definition,
          splitEntityNames(value).map((name) => ({ name })),
          "项目基本情况表主要完成单位",
          0.91,
        );
        continue;
      }
      addCandidate(
        candidates,
        definition,
        definition.key === "applicantUnit" ? cleanApplicantUnit(value) : value,
        `表格字段“${row[cellIndex]}”`,
        0.94,
      );
    }
  }
}

function extractDetailRecord(rows, aliases) {
  const record = {};
  for (const row of rows) {
    for (let cellIndex = 0; cellIndex < row.length - 1; cellIndex += 1) {
      const key = fieldKeyForLabel(row[cellIndex], aliases);
      if (!key) continue;
      const value = row[cellIndex + 1];
      if (!value || isRecordFieldLabel(value)) continue;
      record[key] = key === "rank" ? normalizeRank(value) : value;
    }
  }
  return record.name ? record : null;
}

function extractRosterRecords(rows, aliases) {
  if (rows.length < 2) return [];
  const header = rows[0];
  const columns = header.map((label) => fieldKeyForLabel(label, aliases));
  const recognizedCount = columns.filter(Boolean).length;
  const nonemptyHeaderCount = header.filter(Boolean).length;
  const hasRankOrIndex =
    columns.includes("rank") ||
    header.some((label) =>
      ["序号", "编号"].map(normalizeLabel).includes(normalizeLabel(label)),
    );
  if (
    !columns.includes("name") ||
    recognizedCount < 2 ||
    (!hasRankOrIndex && recognizedCount !== header.length) ||
    recognizedCount / Math.max(nonemptyHeaderCount, 1) < 0.75
  )
    return [];

  return rows
    .slice(1)
    .map((row) => {
      const record = {};
      columns.forEach((key, index) => {
        if (!key || !row[index] || isRecordFieldLabel(row[index])) return;
        record[key] = key === "rank" ? normalizeRank(row[index]) : row[index];
      });
      return record;
    })
    .filter((record) => record.name);
}

function definitionForEmbeddedSection(value) {
  const normalized = normalizeLabel(value);
  const matches = [
    ["立项背景", "background"],
    ["详细技术内容或科学研究内容", "technicalContent"],
    ["主要发现点或技术发明点或技术创新点", "innovations"],
    ["主要技术创新点", "innovations"],
    ["与当前国内外同类技术的比较", "comparison"],
    ["与国内外同类技术的比较", "comparison"],
    ["应用情况", "application"],
    ["经济效益", "economic"],
    ["社会效益", "social"],
  ];
  const key = matches.find(([label]) =>
    normalized.startsWith(normalizeLabel(label)),
  )?.[1];
  return key
    ? FIELD_DEFINITIONS.find((definition) => definition.key === key)
    : null;
}

function stripEmbeddedSectionHeading(cellNode) {
  const childNodes = [...(cellNode.children || [])];
  const firstContentIndex = childNodes.findIndex(
    (child) => child.type === "tag" && cleanText(DomUtils.textContent(child)),
  );
  if (firstContentIndex < 0) return "";
  return childNodes
    .slice(firstContentIndex + 1)
    .filter((child) => child.type === "tag")
    .map((child) => DomUtils.getOuterHTML(child))
    .join("");
}

function extractEmbeddedSectionCandidates(candidates, tableNode) {
  const rows = DomUtils.findAll(
    (child) => child.type === "tag" && child.name === "tr",
    tableNode.children,
  );
  const sections = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const cells = (row.children || []).filter(
      (child) =>
        child.type === "tag" && (child.name === "td" || child.name === "th"),
    );
    if (cells.length !== 1) continue;
    const firstParagraph = DomUtils.findOne(
      (child) => child.type === "tag" && child.name === "p",
      cells[0].children || [],
    );
    const headingText = cleanText(DomUtils.textContent(firstParagraph));
    const definition = definitionForEmbeddedSection(headingText);
    if (definition)
      sections.push({ rowIndex, cell: cells[0], definition, headingText });
  }

  for (let index = 0; index < sections.length; index += 1) {
    const { rowIndex, cell, definition, headingText } = sections[index];
    const nextRowIndex = sections[index + 1]?.rowIndex ?? rows.length;
    const trailingRows = rows.slice(rowIndex + 1, nextRowIndex);
    const trailingTable = trailingRows.length
      ? `<table>${trailingRows.map((row) => DomUtils.getOuterHTML(row)).join("")}</table>`
      : "";
    const contentHtml = `${stripEmbeddedSectionHeading(cell)}${trailingTable}`;
    addCandidate(
      candidates,
      definition,
      contentHtml,
      `表格栏目“${headingText}”`,
      0.95,
    );
  }
}

function isBoldParagraph(node) {
  return (
    node?.type === "tag" &&
    node.name === "p" &&
    node.children?.some(
      (child) =>
        child.type === "tag" && (child.name === "strong" || child.name === "b"),
    ) &&
    node.children
      .filter((child) => child.type === "text")
      .every((child) => !cleanText(child.data))
  );
}

function isSectionBoundary(node) {
  if (node?.type !== "tag") return false;
  if (/^h[1-6]$/.test(node.name)) return true;
  if (node.name !== "p") return false;
  const text = cleanText(DomUtils.textContent(node));
  const definition = definitionForSectionLabel(text);
  if (!definition) return false;
  const normalized = normalizeLabel(text);
  const exactLabel = definition.aliases.some(
    (alias) => normalizeLabel(alias) === normalized,
  );
  const numberedTopLevel =
    /^\s*(?:[一二三四五六七八九十]+|[1-9]\d*)\s*[.．、]/u.test(text);
  return isBoldParagraph(node) || exactLabel || numberedTopLevel;
}

function isEncryptedZip(buffer) {
  for (let offset = 0; offset + 10 <= buffer.length; offset += 1) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50 && signature !== 0x02014b50) continue;
    const flagsOffset = signature === 0x04034b50 ? offset + 6 : offset + 8;
    if ((buffer.readUInt16LE(flagsOffset) & 0x0001) !== 0) return true;
  }
  return false;
}

function isEncryptedOfficeContainer(buffer) {
  const compoundFileSignature = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);
  return (
    buffer.length >= compoundFileSignature.length &&
    buffer
      .subarray(0, compoundFileSignature.length)
      .equals(compoundFileSignature)
  );
}

function hasUnsafeArchivePath(entry) {
  const originalName = String(entry.unsafeOriginalName || entry.name || "");
  return (
    originalName.startsWith("/") ||
    originalName.startsWith("\\") ||
    /^[a-z]:/i.test(originalName) ||
    originalName.split(/[\\/]+/).includes("..")
  );
}

function containsExternalRelationship(xml) {
  const document = parseDocument(String(xml || ""), {
    xmlMode: true,
    decodeEntities: true,
  });
  return (
    DomUtils.findAll((node) => {
      if (node.type !== "tag" || node.name.toLowerCase() !== "relationship")
        return false;
      const attributes = Object.fromEntries(
        Object.entries(node.attribs || {}).map(([name, value]) => [
          name.toLowerCase(),
          String(value).trim(),
        ]),
      );
      return (
        attributes.targetmode?.toLowerCase() === "external" ||
        /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(attributes.target || "")
      );
    }, document.children).length > 0
  );
}

async function inspectDocxArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4)
    throw new WordImportError("文件为空或不是有效的 DOCX 文档");
  if (buffer.length > MAX_FILE_BYTES)
    throw new WordImportError(
      "DOCX 文件大小不能超过 20 MB",
      "document_too_large",
    );
  if (isEncryptedOfficeContainer(buffer))
    throw new WordImportError("不支持加密的 DOCX 文档", "encrypted_document");
  if (buffer.readUInt32LE(0) !== 0x04034b50)
    throw new WordImportError("文件不是有效的 DOCX 压缩包");
  if (isEncryptedZip(buffer))
    throw new WordImportError("不支持加密的 DOCX 文档", "encrypted_document");

  let archive;
  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: false });
  } catch (error) {
    throw new WordImportError(
      `DOCX 压缩包损坏：${error.message}`,
      "invalid_archive",
    );
  }

  const entries = Object.values(archive.files);
  if (entries.length > MAX_ENTRY_COUNT)
    throw new WordImportError(
      "DOCX 内部文件数量超限",
      "archive_limit_exceeded",
    );
  if (
    !archive.file("[Content_Types].xml") ||
    !archive.file("word/document.xml")
  )
    throw new WordImportError("DOCX 缺少必要的 Word 文档结构");
  if (entries.some(hasUnsafeArchivePath))
    throw new WordImportError(
      "DOCX 包含不安全的压缩包路径",
      "suspicious_archive",
    );
  if (entries.some((entry) => /(?:^|\/)vbaProject\.bin$/i.test(entry.name)))
    throw new WordImportError("不支持包含宏的 Word 文档", "macro_document");

  let uncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const compressedSize = Number(entry._data?.compressedSize || 0);
    const uncompressedSize = Number(entry._data?.uncompressedSize || 0);
    if (
      !Number.isSafeInteger(compressedSize) ||
      !Number.isSafeInteger(uncompressedSize) ||
      compressedSize < 0 ||
      uncompressedSize < 0 ||
      (compressedSize === 0 && uncompressedSize > 0)
    )
      throw new WordImportError(
        "DOCX 压缩包条目元数据异常",
        "suspicious_archive",
      );
    uncompressedBytes += uncompressedSize;
    if (uncompressedSize > MAX_ENTRY_BYTES)
      throw new WordImportError(
        "DOCX 内部单个文件解压后超限",
        "archive_limit_exceeded",
      );
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    )
      throw new WordImportError(
        "DOCX 压缩比异常，已拒绝解析",
        "suspicious_archive",
      );
  }
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES)
    throw new WordImportError(
      "DOCX 解压后总体积超限",
      "archive_limit_exceeded",
    );

  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch (error) {
    throw new WordImportError(
      `DOCX 压缩包损坏：${error.message}`,
      "invalid_archive",
    );
  }

  const contentTypes = await archive
    .file("[Content_Types].xml")
    .async("string");
  if (/macroEnabled|vbaProject/i.test(contentTypes))
    throw new WordImportError("不支持包含宏的 Word 文档", "macro_document");

  const verifiedEntries = Object.values(archive.files);
  const relationshipEntries = verifiedEntries.filter(
    (entry) => !entry.dir && /\.rels$/i.test(entry.name),
  );
  for (const entry of relationshipEntries) {
    const xml = await entry.async("string");
    if (containsExternalRelationship(xml))
      throw new WordImportError(
        "DOCX 包含外部关系，已拒绝解析",
        "external_relationship",
      );
  }

  return { archive, entryCount: entries.length, uncompressedBytes };
}

function addCandidate(candidates, definition, value, source, confidence) {
  if (["people", "units"].includes(definition.key) && Array.isArray(value)) {
    const existing = candidates.get(definition.key);
    const records = [...(existing?.value || []), ...value];
    const deduplicated = [];
    const recordIndexes = new Map();
    for (const record of records) {
      const identity = cleanText(record?.name)
        .replace(/\s+/g, "")
        .toLowerCase();
      if (!identity) continue;
      const existingIndex = recordIndexes.get(identity);
      if (existingIndex === undefined) {
        recordIndexes.set(identity, deduplicated.length);
        deduplicated.push({ ...record });
        continue;
      }
      const current = deduplicated[existingIndex];
      deduplicated[existingIndex] = Object.fromEntries(
        Object.entries({ ...current, ...record }).map(([key, fieldValue]) => [
          key,
          cleanText(fieldValue) ? fieldValue : current[key] || "",
        ]),
      );
    }
    const rankedRecords = deduplicated.map((record, index) => ({
      ...record,
      rank: String(index + 1),
    }));
    candidates.set(definition.key, {
      key: definition.key,
      field: definition.field,
      value: rankedRecords,
      source: existing ? `${existing.source}；${source}` : source,
      confidence: Math.max(existing?.confidence || 0, confidence),
      plainLength: rankedRecords.length,
    });
    return;
  }
  const cleanedValue = RICH_FIELDS.has(definition.key)
    ? sanitizeRichTextHtml(value).trim()
    : cleanText(sanitizeHtml(String(value || ""), { allowedTags: [] }));
  const plainValue = cleanText(
    sanitizeHtml(String(cleanedValue), { allowedTags: [] }),
  );
  if (!plainValue) return;

  const candidate = {
    key: definition.key,
    field: definition.field,
    value: cleanedValue,
    source,
    confidence,
  };
  const existing = candidates.get(definition.key);
  if (
    !existing ||
    confidence > existing.confidence ||
    (confidence === existing.confidence &&
      plainValue.length > existing.plainLength)
  ) {
    candidates.set(definition.key, {
      ...candidate,
      plainLength: plainValue.length,
    });
  }
}

function extractCandidatesFromHtml(html) {
  const document = parseDocument(html);
  const nodes = document.children.filter(
    (node) => node.type !== "text" || cleanText(node.data),
  );
  const candidates = new Map();
  const headings = [];
  const paragraphs = [];
  const tables = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type !== "tag") continue;
    const tagName = node.name.toLowerCase();
    if (isSectionBoundary(node)) {
      const headingText = cleanText(DomUtils.textContent(node));
      headings.push(headingText);
      const definition = definitionForSectionLabel(headingText);
      if (!definition) continue;
      const contentNodes = [];
      for (let next = index + 1; next < nodes.length; next += 1) {
        const nextNode = nodes[next];
        if (isSectionBoundary(nextNode)) break;
        if (nextNode.type === "tag") contentNodes.push(nextNode);
      }
      const contentHtml = contentNodes
        .map((contentNode) => DomUtils.getOuterHTML(contentNode))
        .join("");
      if (["people", "units"].includes(definition.key)) continue;
      addCandidate(
        candidates,
        definition,
        contentHtml,
        `标题“${headingText}”后的内容`,
        0.94,
      );
      continue;
    }
    if (tagName === "p") paragraphs.push(cleanText(DomUtils.textContent(node)));
    if (tagName !== "table") continue;

    const tableRows = tableRowsFromNode(node);
    extractEmbeddedSectionCandidates(candidates, node);
    extractIpChapterCandidates(candidates, tableRows);
    if (isProjectBasicTable(tableRows)) {
      extractProjectTableCandidates(candidates, tableRows);
    } else if (isSimpleProjectFieldTable(tableRows)) {
      for (const [label, value] of tableRows) {
        addCandidate(
          candidates,
          definitionForLabel(label),
          value,
          `表格字段“${label}”`,
          0.9,
        );
      }
    }

    const personRecords = extractRosterRecords(tableRows, PERSON_FIELD_ALIASES);
    const personDetail = extractDetailRecord(tableRows, PERSON_FIELD_ALIASES);
    if (personRecords.length || personDetail)
      addCandidate(
        candidates,
        FIELD_DEFINITIONS.find((definition) => definition.key === "people"),
        personRecords.length ? personRecords : [personDetail],
        personRecords.length ? "主要完成人名单表" : "主要完成人情况表",
        personRecords.length ? 0.94 : 0.96,
      );

    const unitRecords = extractRosterRecords(tableRows, UNIT_FIELD_ALIASES);
    const unitDetail = extractDetailRecord(tableRows, UNIT_FIELD_ALIASES);
    if (unitRecords.length || unitDetail)
      addCandidate(
        candidates,
        FIELD_DEFINITIONS.find((definition) => definition.key === "units"),
        unitRecords.length ? unitRecords : [unitDetail],
        unitRecords.length ? "主要完成单位名单表" : "主要完成单位情况表",
        unitRecords.length ? 0.94 : 0.96,
      );
    tables.push(tableRows);
  }

  return {
    candidates: [...candidates.values()].map(
      ({ plainLength: _plainLength, ...candidate }) => candidate,
    ),
    structure: {
      headingCount: headings.length,
      paragraphCount: paragraphs.filter(Boolean).length,
      tableCount: tables.length,
    },
  };
}

export async function extractWordFields(
  buffer,
  fileName = "document.docx",
  options = {},
) {
  const archiveInfo = await inspectDocxArchive(buffer);
  const documentXml = await archiveInfo.archive
    .file("word/document.xml")
    .async("string");
  const importedImages = new Map();
  const imageWarnings = [];
  let importedImageBytes = 0;

  const convertWordImage = async (image) => {
    const contentType = String(image.contentType || "").toLowerCase();
    const extension = WORD_IMAGE_TYPES.get(contentType);
    if (!extension) {
      imageWarnings.push(
        `已忽略不支持的 Word 图片格式：${contentType || "未知格式"}`,
      );
      return { src: "" };
    }

    const base64 = await image.read("base64");
    const byteLength = Buffer.byteLength(base64, "base64");
    if (byteLength > MAX_WORD_IMAGE_BYTES) {
      imageWarnings.push("已忽略超过 5 MB 的 Word 内嵌图片");
      return { src: "" };
    }
    const digest = createHash("sha256")
      .update(contentType)
      .update(base64)
      .digest("hex");
    const existing = importedImages.get(digest);
    if (existing) return { src: existing.placeholder, alt: existing.fileName };
    if (importedImages.size >= MAX_WORD_IMAGE_COUNT) {
      imageWarnings.push("Word 内嵌图片超过 20 张，超出部分已忽略");
      return { src: "" };
    }
    if (importedImageBytes + byteLength > MAX_WORD_IMAGE_TOTAL_BYTES) {
      imageWarnings.push("Word 内嵌图片总体积超过 15 MB，超出部分已忽略");
      return { src: "" };
    }

    const imageNumber = importedImages.size + 1;
    const asset = {
      id: digest.slice(0, 24),
      placeholder: `/api/word-import/image/${digest.slice(0, 24)}`,
      fileName: `word-image-${imageNumber}.${extension}`,
      contentType,
      byteLength,
      base64,
    };
    importedImages.set(digest, asset);
    importedImageBytes += byteLength;
    return { src: asset.placeholder, alt: asset.fileName };
  };

  let conversion;
  try {
    conversion = await mammoth.convertToHtml(
      { buffer },
      {
        includeDefaultStyleMap: true,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='标题'] => h1:fresh",
          "p[style-name='Heading 1'] => h2:fresh",
          "p[style-name='标题 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h3:fresh",
          "p[style-name='标题 2'] => h3:fresh",
        ],
        convertImage: mammoth.images.imgElement(convertWordImage),
      },
    );
  } catch (error) {
    throw new WordImportError(
      `Word 正文解析失败：${error.message}`,
      "parse_failed",
    );
  }

  const safeHtml = sanitizeRichTextHtml(conversion.value);
  const extracted = extractCandidatesFromHtml(safeHtml);
  const sectionFallback = {
    introduction: "introduction",
    unitRecommendation: "recommendation",
    transformation: "transformation",
  }[String(options?.sectionKey || "")];
  if (
    sectionFallback &&
    !extracted.candidates.some((candidate) => candidate.key === sectionFallback)
  ) {
    const definition = FIELD_DEFINITIONS.find(
      (candidate) => candidate.key === sectionFallback,
    );
    if (definition) {
      extracted.candidates.push({
        key: definition.key,
        field: definition.field,
        value: safeHtml,
        source: "本章 Word 正文",
        confidence: 0.88,
      });
    }
  }
  if (
    !extracted.candidates.some((candidate) => candidate.key === "projectName")
  ) {
    const rawTitle = firstDocxParagraphText(documentXml);
    if (
      rawTitle &&
      !/^\s*(?:[一二三四五六七八九十]+|\d+)\s*[、.．]/u.test(rawTitle) &&
      !/申报书|创新奖|申请书|基本情况|研究内容|完成人|经费|预算/u.test(rawTitle)
    ) {
      extracted.candidates.unshift({
        key: "projectName",
        field: "项目名称",
        value: rawTitle,
        source: "DOCX 首个标题段落",
        confidence: 0.78,
      });
    }
  }
  const warnings = conversion.messages
    .filter((message) => message.type === "warning")
    .map((message) => message.message)
    .concat([...new Set(imageWarnings)])
    .slice(0, 10);
  if (!extracted.candidates.length)
    warnings.unshift(
      "未找到可映射到当前申报表单的标题或表格字段，请检查文档是否使用正式模板。",
    );

  return {
    fileName,
    fields: Object.fromEntries(
      extracted.candidates.map((candidate) => [candidate.key, candidate.value]),
    ),
    recognized: extracted.candidates,
    images: [...importedImages.values()],
    matchStats: {
      matched: extracted.candidates.length,
      supported: FIELD_DEFINITIONS.length,
    },
    warnings,
    structure: {
      ...extracted.structure,
      imageCount: importedImages.size,
    },
    archive: {
      entryCount: archiveInfo.entryCount,
      uncompressedBytes: archiveInfo.uncompressedBytes,
    },
  };
}

function legacyRichText(value) {
  const paragraphs = cleanText(value)
    .split(/\n+/u)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line) => `<p>${sanitizeHtml(line, { allowedTags: [] })}</p>`)
    .join("");
  return sanitizeRichTextHtml(paragraphs);
}

function stripLegacyInstructions(value) {
  const emptyTemplateRows = new Set([
    "对比维度 本项目 国内同类先进技术 国外同类先进技术 核心优势 / 差异",
    "技术参数 1",
    "技术参数 2",
    "节能量 / 减排量",
    "资源利用率",
    "单位成本",
    "市场应用规模",
    "其他",
  ]);
  return cleanText(value)
    .split(/\n/u)
    .map((line) => cleanText(line))
    .filter(
      (line) =>
        line &&
        !emptyTemplateRows.has(line) &&
        !/^（?限\s*\d+/u.test(line) &&
        !/^申报(?:技术发明奖|科技进步奖)填写/u.test(line) &&
        !/^（.*(?:填写|阐述|从主要|纸面不敷)/u.test(line),
    )
    .join("\n");
}

function legacyTextBetween(body, start, end) {
  const startMatch = body.match(start);
  if (!startMatch || startMatch.index === undefined) return "";
  const from = startMatch.index + startMatch[0].length;
  const tail = body.slice(from);
  const endMatch = end ? tail.match(end) : null;
  return stripLegacyInstructions(
    endMatch?.index === undefined ? tail : tail.slice(0, endMatch.index),
  );
}

function legacyRowValue(body, aliases) {
  const aliasSet = aliases.map((alias) => normalizeLabel(alias));
  for (const line of String(body || "").split(/\n/u)) {
    const cells = line
      .split(/\t+/u)
      .map((cell) => cleanText(cell))
      .filter(Boolean);
    for (let index = 0; index < cells.length - 1; index += 1) {
      if (!aliasSet.includes(normalizeLabel(cells[index]))) continue;
      const value = cells.slice(index + 1).find((cell) => {
        const normalized = normalizeLabel(cell);
        return (
          normalized &&
          !aliasSet.includes(normalized) &&
          !["盖章", "年月日"].includes(normalized)
        );
      });
      if (value) return value;
    }
  }
  return "";
}

function addLegacyCandidate(candidates, key, field, value, source) {
  const cleaned = RICH_FIELDS.has(key)
    ? legacyRichText(value)
    : cleanText(value);
  if (!cleanText(sanitizeHtml(String(cleaned), { allowedTags: [] }))) return;
  candidates.push({ key, field, value: cleaned, source, confidence: 0.86 });
}

export async function extractLegacyWordFields(
  buffer,
  fileName = "document.doc",
  options = {},
) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8)
    throw new WordImportError("文件为空或不是有效的 Word 文档");
  if (buffer.length > MAX_FILE_BYTES)
    throw new WordImportError(
      "Word 文件大小不能超过 20 MB",
      "document_too_large",
    );
  const compoundFileSignature = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);
  if (!buffer.subarray(0, 8).equals(compoundFileSignature))
    throw new WordImportError("文件不是有效的 .doc 文档", "invalid_document");

  let body;
  try {
    const document = await new WordExtractor().extract(buffer);
    body = cleanText(document.getBody());
  } catch (error) {
    throw new WordImportError(
      `旧版 Word 正文解析失败：${error.message}`,
      "parse_failed",
    );
  }

  const candidates = [];
  if (/项\s*目\s*简\s*介/u.test(body)) {
    const value = stripLegacyInstructions(
      body
        .replace(/^.*?项\s*目\s*简\s*介\s*/su, "")
        .replace(/（?限\s*800\s*(?:个汉)?字）?/gu, ""),
    );
    addLegacyCandidate(
      candidates,
      "introduction",
      "项目简介",
      value,
      "第二章正文",
    );
  }
  if (/项\s*目\s*详\s*细\s*内\s*容/u.test(body)) {
    const fields = [
      [
        "background",
        "立项背景",
        /1[．.、]\s*立项背景\s*[:：]?/u,
        /2[．.、]\s*详细技术内容/u,
      ],
      [
        "technicalContent",
        "详细技术内容或科学研究内容",
        /2[．.、]\s*详细技术内容[^\n]*/u,
        /3[．.、]\s*主要发现点/u,
      ],
      [
        "innovations",
        "主要发现点或技术发明点或技术创新点",
        /3[．.、]\s*主要发现点[^\n]*/u,
        /4[．.、]\s*与当前国内外同类技术/u,
      ],
      [
        "comparison",
        "与当前国内外同类技术的比较",
        /4[．.、]\s*与当前国内外同类技术[^\n]*/u,
        /5[．.、]\s*应用情况/u,
      ],
      [
        "application",
        "应用情况",
        /5[．.、]\s*应用情况[^\n]*/u,
        /6[、．.]\s*经济效益/u,
      ],
      ["social", "社会效益", /7[．.、]\s*社会效益[^\n]*/u, null],
    ];
    for (const [key, field, start, end] of fields)
      addLegacyCandidate(
        candidates,
        key,
        field,
        legacyTextBetween(body, start, end),
        `第三章“${field}”`,
      );
    const economic = legacyTextBetween(
      body,
      /各栏目的计算依据\s*[:：]/u,
      /（?限\s*300\s*字）?/u,
    );
    addLegacyCandidate(
      candidates,
      "economic",
      "各栏目的计算依据",
      economic,
      "第三章经济效益计算依据",
    );
  }
  if (/科技成果转化及推广情况/u.test(body)) {
    const value = stripLegacyInstructions(
      body.replace(/^.*?科技成果转化及推广情况\s*/su, ""),
    );
    addLegacyCandidate(
      candidates,
      "transformation",
      "科技成果转化及推广情况",
      value,
      "第七章正文",
    );
  }
  if (/申\s*报、?推\s*荐\s*单\s*位\s*意\s*见/u.test(body)) {
    addLegacyCandidate(
      candidates,
      "recommendation",
      "申报、推荐单位意见",
      body.replace(/^.*?意\s*见\s*/su, ""),
      "第八章正文",
    );
  }

  const simpleFields = [
    ["projectName", "项目名称", ["中文", "项目名称"]],
    ["projectNameEn", "项目名称（英文）", ["英文", "英文名称"]],
    ["applicantUnit", "第一申报单位", ["第一申报单位", "推荐单位"]],
    ["contact", "联系人", ["联系人"]],
    ["phone", "联系电话", ["联系电话"]],
    ["email", "电子邮箱", ["邮箱", "E-mail"]],
  ];
  for (const [key, field, aliases] of simpleFields)
    addLegacyCandidate(
      candidates,
      key,
      field,
      legacyRowValue(body, aliases),
      "第一章表格",
    );

  const warnings = [];
  const sectionFallback = {
    introduction: "introduction",
    unitRecommendation: "recommendation",
    transformation: "transformation",
  }[String(options?.sectionKey || "")];
  if (
    sectionFallback &&
    !candidates.some((candidate) => candidate.key === sectionFallback)
  ) {
    const definition = FIELD_DEFINITIONS.find(
      (candidate) => candidate.key === sectionFallback,
    );
    if (definition)
      addLegacyCandidate(
        candidates,
        definition.key,
        definition.field,
        body,
        "本章 Word 正文",
      );
  }
  if (!candidates.length)
    warnings.push(
      "本章以签字、盖章或附件清单为主，已读取并保存原 Word 文件，无可自动回填的在线字段。",
    );
  return {
    fileName,
    fields: Object.fromEntries(
      candidates.map(({ key, value }) => [key, value]),
    ),
    recognized: candidates,
    images: [],
    matchStats: {
      matched: candidates.length,
      supported: FIELD_DEFINITIONS.length,
    },
    warnings,
    structure: {
      headingCount: (
        body.match(/(?:^|\n)\s*[一二三四五六七八九十]+[、．.]/gu) || []
      ).length,
      paragraphCount: body.split(/\n+/u).filter((line) => cleanText(line))
        .length,
      tableCount: (body.match(/\t/u) || []).length ? 1 : 0,
      imageCount: 0,
    },
    archive: null,
  };
}

export const WORD_IMPORT_LIMITS = {
  maxFileBytes: MAX_FILE_BYTES,
  maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
  maxEntryBytes: MAX_ENTRY_BYTES,
  maxEntryCount: MAX_ENTRY_COUNT,
  maxCompressionRatio: MAX_COMPRESSION_RATIO,
  maxImageBytes: MAX_WORD_IMAGE_BYTES,
  maxImageTotalBytes: MAX_WORD_IMAGE_TOTAL_BYTES,
  maxImageCount: MAX_WORD_IMAGE_COUNT,
};
