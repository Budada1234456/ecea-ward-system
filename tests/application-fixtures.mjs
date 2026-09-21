export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==",
  "base64",
);

export function completePerson(name = "完成人") {
  return {
    name,
    workUnit: "中国节能测试单位",
    mailingAddress: "北京市朝阳区测试路 1 号",
    homeAddress: "北京市海淀区测试路 2 号",
    email: "person@example.test",
    graduateSchool: "测试大学",
    specialty: "节能技术",
    awards: "节能技术奖",
    projectPeriod: "2024-01 至 2025-12",
    notes: "无",
    contribution: "负责核心技术研发与应用",
  };
}

export function completeUnit(name = "完成单位") {
  return {
    name,
    nature: "企业",
    address: "北京市朝阳区测试路 1 号",
    email: "unit@example.test",
    fax: "010-88886666",
    contribution: "负责成果转化与示范应用",
  };
}

export function completeProjectData(title, overrides = {}) {
  return {
    year: "2026",
    awardType: "节能减排科技进步奖",
    awardLevel: "一等奖",
    projectName: title,
    projectNameEn: "Complete Energy Saving Project",
    applicantUnit: "中国节能测试单位",
    applicationChannel: "自由申报",
    disciplines: [
      {
        code: "480",
        name: "能源科学技术",
        level: 1,
        status: "confirmed",
        path: ["480"],
      },
    ],
    industry: "C",
    sources: ["A"],
    startDate: "2024-01-01",
    endDate: "2025-12-31",
    introduction: "<p>项目简介</p>",
    background: "<p>项目背景</p>",
    technicalContent: "<p>技术方案</p>",
    innovations: "<p>创新内容</p>",
    comparison: "<p>技术比较</p>",
    application: "<p>应用情况</p>",
    people: [completePerson()],
    units: [completeUnit()],
    ...overrides,
  };
}
