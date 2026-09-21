import { getAwardProfile, getAwardSections } from "../award-profiles.js";
import { tableFields } from "../schema/table-fields.js";

export const LONG_TEXT_LIMITS = Object.freeze({
  introduction: 800,
  background: 800,
  innovations: 800,
  application: 800,
  economic: 300,
  social: 300,
  transformation: 800,
  workSummary: 1000,
  technicalEvaluation: 1000,
  unitContribution: 500,
});

const PROJECT_BASIC_FIELDS = [
  ["year", "申报年度"],
  ["awardType", "奖种"],
  ["projectName", "项目名称（中文）"],
  ["projectNameEn", "项目名称（英文）"],
  ["people", "主要完成人"],
  ["units", "主要完成单位"],
  ["applicantUnit", "第一申报单位"],
  ["applicationChannel", "申报渠道"],
  ["disciplines", "学科分类名称"],
  ["industry", "所属国民经济行业"],
  ["sources", "项目来源"],
  ["startDate", "项目起始时间"],
  ["endDate", "项目完成时间"],
];

const ACHIEVEMENT_BASIC_FIELDS = [
  ["year", "申报年度"],
  ["awardType", "奖种"],
  ["projectName", "候选人姓名（中文）"],
  ["candidate.birthDate", "出生年月"],
  ["candidate.workUnit", "候选人工作单位"],
  ["applicantUnit", "推荐单位"],
  ["applicationChannel", "申报渠道"],
  ["workSummary", "节能减排相关工作总结"],
];

const PROJECT_BASIC_LIMITS = [
  ["projectName", "项目名称（中文）", 30],
  ["projectNameEn", "项目名称（英文）", 200],
];

const SECTION_RECORD_GROUPS = Object.freeze({
  awards: "awardRecords",
  ip: "ipRecords",
  people: "people",
  units: "units",
  honors: "awardRecords",
  publications: "paperRecords",
  achievementIp: "ipRecords",
  research: "researchRecords",
  engineering: "engineeringRecords",
});

function valueAt(data, key) {
  return key.split(".").reduce((value, part) => value?.[part], data);
}

export function plainText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

export function characterCount(value) {
  return [...plainText(value)].length;
}

export function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  const source = String(value || "");
  return /<img\b[^>]*>/i.test(source) || plainText(source).length > 0;
}

function requiredFieldErrors(data, fields, sectionKey) {
  return fields
    .filter(([key]) => {
      const value = valueAt(data, key);
      if (key === "people" || key === "units") {
        return (
          !Array.isArray(value) ||
          !value.some((record) =>
            hasValue(typeof record === "string" ? record : record?.name),
          )
        );
      }
      return !hasValue(value);
    })
    .map(([key, label]) => ({
      sectionKey,
      key,
      message: `请填写${label}`,
    }));
}

function recordErrors(data, group, sectionKey) {
  const fields = tableFields[group] || [];
  const requiredFields = fields.filter((field) => field.required);
  const records = Array.isArray(data?.[group]) ? data[group] : [];
  const errors = [];
  records.forEach((record, index) => {
    requiredFields.forEach((field) => {
      if (!hasValue(record?.[field.key])) {
        errors.push({
          sectionKey,
          key: `${group}.${index}.${field.key}`,
          message: `第 ${index + 1} 条记录请填写${field.label}`,
        });
      }
    });
    fields.forEach((field) => {
      if (!field.maxLength) return;
      const count = characterCount(record?.[field.key]);
      if (count > field.maxLength) {
        errors.push({
          sectionKey,
          key: `${group}.${index}.${field.key}`,
          message: `第 ${index + 1} 条记录的${field.label}不得超过 ${field.maxLength} 字（当前 ${count} 字）`,
        });
      }
    });
  });
  return errors;
}

function limitedFieldErrors(data, fields, sectionKey) {
  const errors = [];
  for (const [key, label] of fields) {
    const limit = LONG_TEXT_LIMITS[key];
    if (!limit) continue;
    const count = characterCount(valueAt(data, key));
    if (count > limit) {
      errors.push({
        sectionKey,
        key,
        message: `${label}不得超过 ${limit} 字（当前 ${count} 字）`,
      });
    }
  }
  return errors;
}

function fileTypes(files) {
  return new Set((files || []).map((file) => file.file_type || file.fileType));
}

function attachmentErrors({ data, files, profile, sectionKey }) {
  const types = fileTypes(files);
  const completeSourcePdf =
    profile.mode === "project" &&
    data?.workflowMode === "document" &&
    types.has("source_pdf");
  if (completeSourcePdf) return [];

  if (sectionKey === "recommendation") {
    return profile.recommendationMaterials
      .filter(([category]) => !types.has(category))
      .map(([category, label]) => ({
        sectionKey,
        key: category,
        message: `请上传${label}`,
      }));
  }

  if (sectionKey !== "attachments") return [];
  return [];
}

function sectionTextFields(profile, sectionKey) {
  if (sectionKey === "basic" && profile.code === "achievement")
    return [["workSummary", "节能减排相关工作总结"]];
  if (sectionKey === "introduction") return [["introduction", "项目简介"]];
  if (sectionKey === "details")
    return [
      ...(profile.detailFields || []),
      ["comparison", "与当前国内外同类技术的比较"],
      ["application", "应用情况"],
      ["economic", "各栏目的计算依据"],
      ["social", "社会效益"],
    ];
  if (sectionKey === "comparison")
    return [["comparison", profile.comparisonLabel || "同类技术比较"]];
  if (sectionKey === "application")
    return [
      ["application", "应用情况"],
      ["economic", "各栏目的计算依据"],
      ["social", "社会效益"],
    ];
  if (sectionKey === "transformation")
    return [["transformation", "科技成果转化及推广"]];
  if (sectionKey === "ip")
    return [["technicalEvaluation", "技术评价证明及行业审批文件目录"]];
  return [];
}

function requiredTextFields(profile, sectionKey) {
  if (sectionKey === "introduction") return [["introduction", "项目简介"]];
  if (sectionKey === "details")
    return [
      ...(profile.detailFields || []),
      ["comparison", "与当前国内外同类技术的比较"],
      ["application", "应用情况"],
    ];
  if (sectionKey === "comparison")
    return [["comparison", profile.comparisonLabel || "同类技术比较"]];
  if (sectionKey === "application") return [["application", "应用情况"]];
  if (sectionKey === "transformation")
    return [["transformation", "科技成果转化及推广"]];
  return [];
}

export function validateSection({
  data = {},
  sectionKey,
  awardType,
  files = [],
}) {
  const profile = getAwardProfile(awardType || data.awardType);
  const errors = [];

  if (sectionKey === "basic") {
    errors.push(
      ...requiredFieldErrors(
        data,
        profile.code === "achievement"
          ? ACHIEVEMENT_BASIC_FIELDS
          : PROJECT_BASIC_FIELDS,
        sectionKey,
      ),
    );
    if (profile.mode === "project") {
      for (const [key, label, limit] of PROJECT_BASIC_LIMITS) {
        const count = characterCount(valueAt(data, key));
        if (count > limit) {
          errors.push({
            sectionKey,
            key,
            message: `${label}不得超过 ${limit} 字（当前 ${count} 字）`,
          });
        }
      }
    }
  }

  const requiredFields = requiredTextFields(profile, sectionKey);
  errors.push(...requiredFieldErrors(data, requiredFields, sectionKey));
  errors.push(
    ...limitedFieldErrors(
      data,
      sectionTextFields(profile, sectionKey),
      sectionKey,
    ),
  );

  const group = SECTION_RECORD_GROUPS[sectionKey];
  if (group) errors.push(...recordErrors(data, group, sectionKey));

  if (sectionKey === "units") {
    (data.units || []).forEach((unit, index) => {
      const count = characterCount(unit?.contribution);
      if (count > LONG_TEXT_LIMITS.unitContribution) {
        errors.push({
          sectionKey,
          key: `units.${index}.contribution`,
          message: `第 ${index + 1} 个完成单位的贡献不得超过 ${LONG_TEXT_LIMITS.unitContribution} 字（当前 ${count} 字）`,
        });
      }
    });
  }

  errors.push(...attachmentErrors({ data, files, profile, sectionKey }));
  return errors;
}

export function validateApplication({ data = {}, awardType, files = [] }) {
  const resolvedAwardType = awardType || data.awardType;
  return getAwardSections(resolvedAwardType).flatMap(({ key }) =>
    validateSection({
      data,
      sectionKey: key,
      awardType: resolvedAwardType,
      files,
    }),
  );
}
