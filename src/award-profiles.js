export const AWARD_TYPES = Object.freeze({
  ACHIEVEMENT: "节能减排科技成就奖",
  PROGRESS: "节能减排科技进步奖",
  INVENTION: "节能减排技术发明奖",
});

const projectSections = [
  ["basic", "项目基本情况", "一、项目基本情况.docx"],
  ["introduction", "项目简介", "二、项目简介.docx"],
  ["details", "项目详细内容", "三、项目详细内容.docx"],
  ["awards", "本项目曾获奖励情况", "四、本项目曾获奖励情况.docx"],
  ["ip", "申请、获得知识产权情况表", "五、申请、获得知识产权情况表.docx"],
  ["people", "主要完成人情况表", "六、主要完成人情况表.docx"],
  ["units", "主要完成单位情况表", "七、主要完成单位情况表.docx"],
  ["unitRecommendation", "申报、推荐单位意见", "八、申报、推荐单位意见.docx"],
  ["expertRecommendation", "专家推荐意见", "九、专家推荐意见.docx"],
  ["attachments", "附件目录", "十、附件目录.docx"],
  ["authenticity", "真实性承诺书", "十一、真实性承诺书.docx"],
  ["confidentiality", "不涉密承诺函", "十二、不涉密承诺函.docx"],
  ["integrity", "诚信承诺书", "十三、诚信承诺书.docx"],
];

const progressSections = projectSections;
const inventionSections = projectSections;

const achievementSections = [
  ["basic", "基本情况", "一、基本情况.doc"],
  [
    "honors",
    "所获科技奖励和荣誉称号情况",
    "二、所获与节能减排相关科技奖励和荣誉称号情况.doc",
  ],
  [
    "publications",
    "发表论文和专著情况",
    "三、发表节能减排相关论文和专著情况.doc",
  ],
  ["achievementIp", "所获知识产权证书", "四、所获知识产权证书.doc"],
  ["research", "承担科研项目情况", "五、承担节能减排相关的科研项目情况.doc"],
  [
    "engineering",
    "参与重大工程技术项目情况",
    "六、参与节能减排相关的重大工程技术项目情况.doc",
  ],
  [
    "transformation",
    "科技成果转化及推广情况",
    "七、与节能减排相关的科技成果转化及推广情况.doc",
  ],
  ["attachments", "附件", "八、附件.doc"],
  ["authenticity", "真实性承诺书", "九、真实性承诺书.doc"],
  ["integrity", "诚信承诺书", "十、诚信承诺书.doc"],
];

const chapterFields = Object.freeze({
  basic: [
    "projectName",
    "projectNameEn",
    "applicantUnit",
    "contact",
    "phone",
    "email",
    "people",
    "units",
    "workSummary",
    "resume",
  ],
  introduction: ["introduction"],
  details: [
    "background",
    "technicalContent",
    "innovations",
    "comparison",
    "application",
    "economic",
    "social",
  ],
  awards: ["awardRecords"],
  ip: ["ipRecords", "technicalEvaluation", "applicationUnits"],
  people: ["people", "cooperationRecords"],
  units: ["units"],
  unitRecommendation: ["recommendation"],
  expertRecommendation: [],
  attachments: [],
  authenticity: [],
  confidentiality: [],
  integrity: [],
  honors: ["awardRecords"],
  publications: ["paperRecords"],
  achievementIp: ["ipRecords"],
  research: ["researchRecords"],
  engineering: ["engineeringRecords"],
  transformation: ["transformation"],
});

const chapterRequirements = Object.freeze({
  unitRecommendation:
    "申报单位须明确审核项目的真实性、创新性和应用价值；推荐单位须勾选建议奖励等级并阐明理由，完成后加盖公章。专家推荐申报不填写本章。",
  expertRecommendation:
    "由各推荐专家独立填写，不得代填后签名。推荐意见限 800 字，并须明确建议奖励等级。",
  attachments:
    "按模板目录逐项准备证明材料。Word 为未盖章原始版，表格内容不得以图片粘贴；PDF 须为盖章后的完整版本并与纸质版一致。",
  authenticity:
    "申报单位确认申报书和全部附件真实、合法、有效，完成后加盖申报单位公章并填写日期。",
  confidentiality:
    "对全部纸质和电子材料完成保密自查，确认不含国家秘密、工作秘密及敏感信息，签字盖章后提交。",
  integrity:
    "逐项核对科研诚信、知识产权、申报程序及近三年记录，承诺单位盖章、项目负责人签字并填写完整信息。",
});

const signedChapterKeys = new Set([
  "authenticity",
  "confidentiality",
  "integrity",
]);

const projectRecommendationMaterials = [
  [
    "recommendation_signed",
    "签章意见附件",
    "上传已填写并加盖单位公章的 PDF 或扫描图片。",
  ],
];

const projectAttachmentMaterials = [
  [
    "technical_proof",
    "1. 技术证明材料",
    "技术研发报告、技术鉴定证书、验收报告或评估报告等（复印件）。",
  ],
  [
    "application_proof",
    "2. 应用证明",
    "经济效益证明、用户使用证明或社会效益证明（原件）。",
  ],
  [
    "evaluation_report",
    "3. 科技成果评价报告",
    "提交可在国家科技成果信息网查询的科技成果评价报告。",
  ],
  ["novelty_report", "4. 科技查新报告", "科技查新报告（复印件）。"],
  [
    "patent_proof",
    "5. 国家发明专利证明",
    "国家发明专利证书或发明权利要求书（复印件），其他知识产权附后。",
  ],
  ["inventor_id", "6. 主要完成人身份证", "主要完成人身份证复印件一份。"],
  [
    "unit_license",
    "7. 主要完成单位营业执照",
    "主要完成单位营业执照副本一份，并加盖公章。",
  ],
  [
    "other",
    "8. 其他证明（按需）",
    "国家法律法规要求的行业审批材料和证明文件、检测报告、环境监测报告、奖励证书、主持或参与制定国家和行业标准（复印件）。",
  ],
];

// The filling instructions require items 1-7 for project awards. Item 8 is
// conditional and is uploaded when it applies to the project.
const projectRequiredAttachmentGroups = [
  { label: "1. 技术证明材料", categories: ["technical_proof"] },
  { label: "2. 应用证明", categories: ["application_proof"] },
  { label: "3. 科技成果评价报告", categories: ["evaluation_report"] },
  { label: "4. 科技查新报告", categories: ["novelty_report"] },
  { label: "5. 国家发明专利证明", categories: ["patent_proof"] },
  { label: "6. 主要完成人身份证", categories: ["inventor_id"] },
  { label: "7. 主要完成单位营业执照", categories: ["unit_license"] },
];

const profiles = {
  [AWARD_TYPES.ACHIEVEMENT]: {
    value: AWARD_TYPES.ACHIEVEMENT,
    code: "achievement",
    templateFolder: "科技成就奖",
    mode: "individual",
    subjectLabel: "候选人姓名",
    summary: "奖励长期活跃在节能减排科技前沿并作出重大原创贡献的个人。",
    conditions: "候选人申报年末不超过 60 周岁，须为主要发明成果第一完成人。",
    sections: achievementSections,
    minimumApplicationYears: null,
    maxPeople: 1,
    maxUnits: 0,
    detailContentLabel: "候选人代表性科技贡献",
    innovationLabel: "候选人核心成就",
    recommendationMaterials: [
      ["commitment_letter", "候选人承诺函", "由候选人本人签字后上传。"],
      ["recommendation_letter", "推荐函", "由推荐单位出具红头函件并加盖公章。"],
    ],
    attachmentMaterials: [
      [
        "achievement_honors",
        "科技奖励和荣誉证明",
        "上传市级以上政府或全国性行业协会授予的证书或文件。",
      ],
      [
        "achievement_publications",
        "代表性论文、专著",
        "提交代表性论文、专著复印件，合计不超过 5 篇（册）。",
      ],
      [
        "achievement_ip",
        "知识产权证明",
        "上传授权证书、权利要求书或其他完整知识产权证明。",
      ],
      [
        "achievement_research",
        "科研项目证明",
        "上传候选人承担科研项目的立项或验收文件。",
      ],
      [
        "achievement_benefits",
        "效益证明",
        "上传成果转化、推广应用及经济社会效益证明。",
      ],
      [
        "achievement_other",
        "其他证明或补充材料",
        "可选上传候选人科技创新、客观评价和学术贡献等证明，不超过 20 个文件。",
      ],
    ],
    requiredAttachmentGroups: [
      {
        label: "科技奖励和荣誉证明",
        categories: ["achievement_honors"],
      },
      {
        label: "代表性论文或专著",
        categories: [
          "achievement_papers",
          "achievement_books",
          "achievement_publications",
        ],
      },
      { label: "知识产权证明", categories: ["achievement_ip"] },
      { label: "科研项目证明", categories: ["achievement_research"] },
      { label: "效益证明", categories: ["achievement_benefits"] },
    ],
    fileLimits: {
      achievement_publications: 5,
      achievement_other: 20,
    },
  },
  [AWARD_TYPES.PROGRESS]: {
    value: AWARD_TYPES.PROGRESS,
    code: "progress",
    templateFolder: "科技进步奖",
    mode: "project",
    subjectLabel: "项目名称",
    summary: "奖励在技术创新、成果应用和产业化方面推动行业科技进步的项目。",
    conditions: "成果实践应用超过 1 年，近 2 年完成国家科技成果登记系统评价。",
    sections: progressSections,
    detailFields: [
      ["background", "1．立项背景"],
      ["technicalContent", "2．详细技术内容或科学研究内容"],
      ["innovations", "3．主要发现点或技术发明点或技术创新点"],
    ],
    comparisonLabel: "主要技术创新点、应用推广和行业进步",
    comparisonGuidance:
      "突出总体思路、技术方案、成果转化、应用推广效果及对行业科技进步的作用。",
    submissionFields: [
      ["introduction", "项目简介"],
      ["background", "立项背景"],
      ["technicalContent", "总体思路与技术方案"],
      ["innovations", "实施效果与技术创新点"],
      ["comparison", "技术创新点、应用推广和行业进步"],
      ["application", "应用情况"],
    ],
    minimumApplicationYears: 1,
    maxPeople: 15,
    maxUnits: 10,
    detailContentLabel: "详细技术内容或科学研究内容",
    innovationLabel: "主要技术创新点",
    recommendationMaterials: projectRecommendationMaterials,
    attachmentMaterials: projectAttachmentMaterials,
    requiredAttachmentGroups: projectRequiredAttachmentGroups,
    fileLimits: {},
  },
  [AWARD_TYPES.INVENTION]: {
    value: AWARD_TYPES.INVENTION,
    code: "invention",
    templateFolder: "技术发明奖",
    mode: "project",
    subjectLabel: "项目名称",
    summary:
      "奖励国内外首创并在新工艺、新材料、新系统能效提升方面取得突破的技术发明。",
    conditions:
      "成果试验、应用超过 2 年，近 2 年完成国家科技成果登记系统评价。",
    sections: inventionSections,
    detailFields: [
      ["background", "1．立项背景"],
      ["technicalContent", "2．详细技术内容或科学研究内容"],
      ["innovations", "3．主要发现点或技术发明点或技术创新点"],
    ],
    comparisonLabel: "知识产权依据",
    comparisonGuidance:
      "说明首创性、技术发明点与知识产权权利要求之间的对应关系，避免沿用科技进步奖的表述。",
    submissionFields: [
      ["introduction", "项目简介"],
      ["background", "技术原理与技术方法"],
      ["technicalContent", "产品、工艺或材料发明内容"],
      ["innovations", "核心技术措施与技术发明点"],
      ["comparison", "知识产权依据"],
      ["application", "应用情况"],
    ],
    minimumApplicationYears: 2,
    maxPeople: 10,
    maxUnits: 0,
    detailContentLabel: "技术原理、技术方法及核心措施",
    innovationLabel: "主要技术发明点",
    recommendationMaterials: projectRecommendationMaterials,
    attachmentMaterials: projectAttachmentMaterials,
    requiredAttachmentGroups: projectRequiredAttachmentGroups,
    fileLimits: {},
  },
};

export const awardProfiles = Object.freeze(Object.values(profiles));

export function getAwardProfile(value) {
  return profiles[value] || profiles[AWARD_TYPES.PROGRESS];
}

export function getAwardSections(value) {
  const profile = getAwardProfile(value);
  return profile.sections.map(([key, label, templateFile], index) => ({
    key,
    label,
    number: index + 1,
    templateFile,
    templateHref: `/materials/${encodeURIComponent(profile.templateFolder)}/${encodeURIComponent(templateFile)}`,
    allowedFieldKeys: chapterFields[key] || [],
    uploadMode: signedChapterKeys.has(key) ? "signed" : "word",
    requirement:
      chapterRequirements[key] ||
      "请严格按照本章模板中的栏目、顺序、字数限制和填写说明完成内容。",
  }));
}

export function getSubmissionRequirements(value) {
  const profile = getAwardProfile(value);
  if (profile.code === "achievement") {
    return [
      { key: "projectName", label: "候选人姓名" },
      { key: "applicantUnit", label: "推荐单位" },
      { key: "candidate.workUnit", label: "候选人工作单位" },
      { key: "candidate.birthDate", label: "候选人出生年月" },
      { key: "workSummary", label: "节能减排相关工作总结" },
      { key: "transformation", label: "科技成果转化及推广" },
    ];
  }
  return [
    { key: "projectName", label: "项目名称" },
    { key: "applicantUnit", label: "第一申报单位" },
    ...(profile.submissionFields || []).map(([key, label]) => ({
      key,
      label,
    })),
    { key: "people", label: "主要完成人" },
    { key: "units", label: "主要完成单位" },
  ];
}
