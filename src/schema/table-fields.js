/**
 * Shared field metadata for the structured application sections.
 *
 * The order of each array is the render/export order. Keep these keys aligned
 * with the legacy application JSON until C completes the main.jsx migration.
 */

export const FIELD_GROUPS = [
  "awardRecords",
  "ipRecords",
  "paperRecords",
  "applicationUnits",
  "economicSummary",
  "economicRecords",
  "cooperationRecords",
  "researchRecords",
  "engineeringRecords",
  "people",
  "units",
];

const textField = (key, label, options = {}) => ({
  key,
  label,
  type: "text",
  defaultValue: "",
  required: false,
  pdfVisible: true,
  wordKey: `${options.group || ""}.${key}`.replace(/^\./, ""),
  ...options,
});

const multilineField = (key, label, options = {}) =>
  textField(key, label, { multiline: true, ...options });

const numberField = (key, label, options = {}) =>
  textField(key, label, { type: "number", inputMode: "decimal", ...options });

const dateField = (key, label, options = {}) =>
  textField(key, label, { type: "date", ...options });

const baseTableFields = {
  awardRecords: [
    textField("name", "获奖项目名称", {
      group: "awardRecords",
      required: true,
      multiline: true,
      maxLength: 200,
      width: "minmax(220px, 1.7fr)",
      minWidth: 240,
    }),
    dateField("date", "获奖时间", {
      group: "awardRecords",
      width: "140px",
      minWidth: 140,
    }),
    textField("award", "奖项名称", {
      group: "awardRecords",
      width: "minmax(160px, 1fr)",
      minWidth: 170,
    }),
    textField("level", "奖励等级", {
      group: "awardRecords",
      width: "120px",
      minWidth: 120,
    }),
    textField("org", "授奖部门（组织）", {
      group: "awardRecords",
      width: "minmax(180px, 1fr)",
      minWidth: 190,
    }),
  ],
  ipRecords: [
    textField("name", "授权（申请）项目名称", {
      group: "ipRecords",
      required: true,
      multiline: true,
      maxLength: 200,
      width: "minmax(220px, 1.7fr)",
      minWidth: 240,
    }),
    textField("type", "知识产权类别", {
      group: "ipRecords",
      width: "150px",
      minWidth: 150,
    }),
    textField("country", "国（区）别", {
      group: "ipRecords",
      width: "120px",
      minWidth: 120,
    }),
    textField("applicationNumber", "申请号", {
      group: "ipRecords",
      width: "170px",
      minWidth: 170,
    }),
    textField("authorizationNumber", "授权号", {
      group: "ipRecords",
      legacyKeys: ["number"],
      width: "170px",
      minWidth: 170,
    }),
  ],
  paperRecords: [
    multilineField("title", "论著名称", {
      group: "paperRecords",
      width: "minmax(220px, 1.7fr)",
      minWidth: 240,
    }),
    textField("publisher", "出版单位", {
      group: "paperRecords",
      width: "minmax(170px, 1.2fr)",
      minWidth: 180,
    }),
    numberField("publicationYear", "出版年份", {
      group: "paperRecords",
      width: "105px",
      minWidth: 105,
    }),
    textField("authors", "作者", {
      group: "paperRecords",
      width: "minmax(150px, 1fr)",
      minWidth: 160,
    }),
    numberField("authorRank", "本人排序", {
      group: "paperRecords",
      numeric: true,
      width: "95px",
      minWidth: 95,
    }),
    textField("domestic", "是否国内出版", {
      group: "paperRecords",
      options: ["是", "否"],
      width: "120px",
      minWidth: 120,
    }),
  ],
  applicationUnits: [
    textField("unitName", "应用单位名称", {
      group: "applicationUnits",
      required: true,
      width: "minmax(220px, 1.5fr)",
      minWidth: 230,
    }),
    textField("technology", "应用技术", {
      group: "applicationUnits",
      width: "minmax(220px, 1.5fr)",
      minWidth: 230,
    }),
    textField("startDate", "应用起始时间", {
      group: "applicationUnits",
      type: "month",
      width: "145px",
      minWidth: 145,
    }),
    textField("endDate", "应用截止时间", {
      group: "applicationUnits",
      type: "month",
      width: "145px",
      minWidth: 145,
    }),
    textField("contactPhone", "应用单位联系人及电话", {
      group: "applicationUnits",
      width: "210px",
      minWidth: 210,
    }),
    numberField("economicBenefit", "使用本项目产生的经济效益（万元）", {
      group: "applicationUnits",
      width: "150px",
      minWidth: 150,
    }),
  ],
  economicSummary: [
    numberField("totalInvestment", "项目总投资额", {
      group: "economicSummary",
      unit: "万元人民币",
    }),
    numberField("paybackYears", "回收期（年）", {
      group: "economicSummary",
      unit: "年",
    }),
  ],
  economicRecords: [
    numberField("year", "年度", {
      group: "economicRecords",
      type: "number",
      width: "100px",
      minWidth: 100,
    }),
    numberField("newSales", "新增销售额", {
      group: "economicRecords",
      unit: "万元人民币",
    }),
    numberField("newProfit", "新增利润", {
      group: "economicRecords",
      unit: "万元人民币",
    }),
    numberField("newTax", "新增税收", {
      group: "economicRecords",
      unit: "万元人民币",
    }),
    numberField("foreignExchange", "创收外汇", {
      group: "economicRecords",
      unit: "万美元",
    }),
    numberField("savingsTotal", "节支总额", {
      group: "economicRecords",
      unit: "万元人民币",
    }),
  ],
  cooperationRecords: [
    textField("method", "合作方式", {
      group: "cooperationRecords",
      width: "150px",
      minWidth: 150,
    }),
    textField("collaborators", "合作者", {
      group: "cooperationRecords",
      width: "180px",
      minWidth: 180,
    }),
    textField("period", "合作时间", {
      group: "cooperationRecords",
      width: "170px",
      minWidth: 170,
    }),
    multilineField("output", "合作成果", {
      group: "cooperationRecords",
      width: "minmax(260px, 1.5fr)",
      minWidth: 280,
    }),
    multilineField("evidence", "证明材料", {
      group: "cooperationRecords",
      width: "minmax(220px, 1fr)",
      minWidth: 230,
    }),
    textField("notes", "备注", {
      group: "cooperationRecords",
      width: "180px",
      minWidth: 180,
    }),
  ],
  researchRecords: [
    multilineField("name", "科研项目名称", {
      group: "researchRecords",
      required: true,
      width: "minmax(240px, 1.8fr)",
      minWidth: 250,
    }),
    textField("source", "项目来源及编号", {
      group: "researchRecords",
      width: "minmax(190px, 1.2fr)",
      minWidth: 200,
    }),
    textField("period", "起止时间", {
      group: "researchRecords",
      width: "170px",
      minWidth: 170,
    }),
    textField("role", "本人角色", {
      group: "researchRecords",
      width: "140px",
      minWidth: 140,
    }),
    multilineField("result", "完成情况及代表性成果", {
      group: "researchRecords",
      width: "minmax(260px, 1.8fr)",
      minWidth: 280,
    }),
  ],
  engineeringRecords: [
    multilineField("name", "重大工程技术项目名称", {
      group: "engineeringRecords",
      required: true,
      width: "minmax(250px, 1.8fr)",
      minWidth: 260,
    }),
    textField("period", "参与时间", {
      group: "engineeringRecords",
      width: "170px",
      minWidth: 170,
    }),
    textField("role", "本人角色", {
      group: "engineeringRecords",
      width: "140px",
      minWidth: 140,
    }),
    multilineField("contribution", "主要技术贡献", {
      group: "engineeringRecords",
      width: "minmax(300px, 2fr)",
      minWidth: 320,
    }),
  ],
  people: [
    textField("name", "姓名", { group: "people", required: true }),
    textField("gender", "性别", { group: "people" }),
    textField("rank", "排名", {
      group: "people",
      type: "number",
      readOnly: true,
    }),
    dateField("birthDate", "出生年月", { group: "people" }),
    textField("birthPlace", "出生地", { group: "people" }),
    textField("ethnicity", "民族", { group: "people" }),
    textField("nativePlace", "籍贯", { group: "people" }),
    textField("idNumber", "身份证号", { group: "people" }),
    textField("politicalAffiliation", "党派", { group: "people" }),
    textField("nationality", "国籍", {
      group: "people",
      defaultValue: "中国",
    }),
    textField("administrativePosition", "行政职务", { group: "people" }),
    textField("returnee", "归国人员", { group: "people" }),
    dateField("returnDate", "归国时间", { group: "people" }),
    textField("workUnit", "工作单位", { group: "people", required: true }),
    textField("officePhone", "办公电话", { group: "people" }),
    textField("mailingAddress", "通讯地址", {
      group: "people",
      required: true,
    }),
    textField("postalCode", "邮政编码", { group: "people" }),
    textField("homeAddress", "家庭住址", { group: "people", required: true }),
    textField("homePhone", "住宅电话", { group: "people" }),
    textField("email", "电子邮箱", { group: "people", required: true }),
    textField("mobilePhone", "移动电话", { group: "people" }),
    textField("graduateSchool", "毕业学校", {
      group: "people",
      required: true,
    }),
    dateField("graduationDate", "毕业时间", { group: "people" }),
    textField("education", "文化程度", { group: "people" }),
    textField("technicalTitle", "技术职称", { group: "people" }),
    textField("specialty", "专业、专长", { group: "people", required: true }),
    textField("highestDegree", "最高学位", { group: "people" }),
    multilineField("awards", "曾获奖励", { group: "people", required: true }),
    textField("projectPeriod", "参加本项目起止时间", {
      group: "people",
      required: true,
    }),
    multilineField("notes", "备注", { group: "people", required: true }),
    multilineField("contribution", "对本项目主要贡献", { group: "people" }),
  ],
  units: [
    textField("name", "单位名称", { group: "units", required: true }),
    textField("location", "所在地", { group: "units" }),
    textField("rank", "排名", {
      group: "units",
      type: "number",
      readOnly: true,
    }),
    textField("nature", "单位性质", { group: "units", required: true }),
    textField("contact", "联系人", { group: "units" }),
    textField("phone", "联系电话", { group: "units" }),
    textField("mobilePhone", "移动电话", { group: "units" }),
    textField("address", "通讯地址", { group: "units", required: true }),
    textField("postalCode", "邮政编码", { group: "units" }),
    textField("email", "电子邮箱", { group: "units", required: true }),
    textField("fax", "传真", { group: "units" }),
    multilineField("contribution", "对本项目技术创新和应用的贡献", {
      group: "units",
    }),
  ],
};

// Entry guidance describes the expected content; only maxLength is enforced.
const FIELD_GUIDANCE = {
  awardRecords: {
    name: "填写获奖项目的完整名称，限200字",
    date: "填写获奖日期",
    award: "填写奖项正式名称",
    level: "填写获奖等级，以证书为准",
    org: "填写证书上的授奖部门或组织",
  },
  ipRecords: {
    name: "填写授权或申请项目的完整名称，限200字",
    type: "填写知识产权类别，如发明专利或软件著作权",
    country: "填写申请或授权的国家（地区）",
    applicationNumber: "填写申请文件上的申请号",
    authorizationNumber: "填写授权文件上的授权号；尚未授权可留空",
  },
  paperRecords: {
    title: "填写论著的完整名称",
    publisher: "填写出版单位或期刊名称",
    publicationYear: "填写出版年份，如2025",
    authors: "填写作者姓名，按论著署名顺序",
    authorRank: "填写本人在作者中的排序，如1",
    domestic: "选择是否在国内出版",
  },
  applicationUnits: {
    unitName: "填写实际应用本项目技术的单位全称",
    technology: "填写该单位实际应用的项目技术",
    startDate: "填写开始应用的年月",
    endDate: "填写截止应用的年月；持续应用可留空",
    contactPhone: "填写应用单位联系人姓名及联系电话",
    economicBenefit: "填写该单位使用本项目产生的经济效益，单位：万元",
  },
  economicSummary: {
    totalInvestment: "填写项目总投资额，单位：万元人民币",
    paybackYears: "填写投资回收期，单位：年",
  },
  economicRecords: {
    year: "填写统计年度，如2025",
    newSales: "填写本年度新增销售额，单位：万元人民币",
    newProfit: "填写本年度新增利润，单位：万元人民币",
    newTax: "填写本年度新增税收，单位：万元人民币",
    foreignExchange: "填写本年度创收外汇，单位：万美元",
    savingsTotal: "填写本年度节支总额，单位：万元人民币",
  },
  cooperationRecords: {
    method: "填写合作形式，如共同研发或技术转让",
    collaborators: "填写合作方名称或人员姓名",
    period: "填写合作起止时间",
    output: "填写合作形成的具体成果",
    evidence: "填写对应证明材料的名称或编号",
    notes: "填写需要补充说明的合作情况",
  },
  researchRecords: {
    name: "填写候选人承担的科研项目正式名称",
    source: "填写计划、基金来源及项目编号",
    period: "填写项目起止年月",
    role: "填写负责人、课题负责人或主要参与人等",
    result: "填写项目完成情况及形成的代表性成果",
  },
  engineeringRecords: {
    name: "填写候选人参与的重大工程技术项目正式名称",
    period: "填写实际参与项目的起止时间",
    role: "填写候选人在项目中的职责",
    contribution: "说明候选人解决的关键技术问题及实际贡献",
  },
  people: {
    name: "填写与身份证件一致的姓名",
    gender: "填写性别",
    rank: "由完成人排序自动生成",
    birthDate: "填写出生年月",
    birthPlace: "填写出生地",
    ethnicity: "填写民族",
    nativePlace: "填写籍贯",
    idNumber: "填写身份证件号码",
    politicalAffiliation: "填写党派或政治面貌",
    nationality: "填写国籍",
    administrativePosition: "填写现任行政职务",
    returnee: "填写是否为归国人员",
    returnDate: "归国人员填写归国时间",
    workUnit: "填写当前工作单位全称",
    officePhone: "填写办公电话及区号",
    mailingAddress: "填写可接收材料的通讯地址",
    postalCode: "填写通讯地址对应邮政编码",
    homeAddress: "填写家庭住址",
    homePhone: "填写住宅电话及区号",
    email: "填写常用电子邮箱",
    mobilePhone: "填写可联系的移动电话",
    graduateSchool: "填写毕业学校全称",
    graduationDate: "填写毕业时间",
    education: "填写文化程度",
    technicalTitle: "填写现有专业技术职称",
    specialty: "填写专业方向或技术专长",
    highestDegree: "填写已取得的最高学位",
    awards: "填写曾获奖励的名称、时间和等级",
    projectPeriod: "填写参加本项目的起止时间",
    notes: "填写需补充说明的个人情况",
    contribution: "具体说明本人对本项目的主要贡献",
  },
  units: {
    name: "填写完成单位的法定全称",
    location: "填写单位所在地",
    rank: "由完成单位排序自动生成",
    nature: "填写单位性质，如企业或科研院所",
    contact: "填写单位联系人姓名",
    phone: "填写联系电话及区号",
    mobilePhone: "填写联系人移动电话",
    address: "填写单位通讯地址",
    postalCode: "填写通讯地址对应邮政编码",
    email: "填写单位或联系人电子邮箱",
    fax: "填写单位传真号码及区号",
    contribution: "具体说明本单位对项目技术创新和应用的贡献",
  },
};

export const tableFields = Object.fromEntries(
  Object.entries(baseTableFields).map(([group, fields]) => [
    group,
    fields.map((field) => ({
      ...field,
      hint: FIELD_GUIDANCE[group]?.[field.key],
    })),
  ]),
);

export const FIELD_DEFAULTS = Object.fromEntries(
  FIELD_GROUPS.map((group) => [
    group,
    Object.fromEntries(
      tableFields[group].map((field) => [field.key, field.defaultValue]),
    ),
  ]),
);

export function getFieldDefinition(group, key) {
  return tableFields[group]?.find((field) => field.key === key) || null;
}

export function getPdfFields(group) {
  return (tableFields[group] || []).filter(
    (field) => field.pdfVisible !== false,
  );
}

export function createDefaultRecord(group) {
  const defaults = FIELD_DEFAULTS[group];
  if (!defaults) throw new Error(`Unknown field group: ${group}`);
  return { ...defaults };
}
