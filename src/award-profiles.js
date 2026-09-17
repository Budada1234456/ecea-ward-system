export const AWARD_TYPES = Object.freeze({
  ACHIEVEMENT: "节能减排科技成就奖",
  PROGRESS: "节能减排科技进步奖",
  INVENTION: "节能减排技术发明奖",
});

const projectSections = [
  ["basic", "基本情况"],
  ["introduction", "项目简介"],
  ["details", "项目详细内容"],
  ["comparison", "同类技术比较"],
  ["application", "应用及效益"],
  ["awards", "曾获奖励情况"],
  ["ip", "知识产权情况"],
  ["people", "主要完成人"],
  ["units", "主要完成单位"],
  ["recommendation", "申报、推荐单位意见"],
  ["attachments", "附件目录"],
];

const progressSections = projectSections.map(([key, label]) => [
  key,
  {
    basic: "项目基本情况",
    details: "总体思路、技术方案与实施效果",
    comparison: "技术创新点与行业进步",
  }[key] || label,
]);

const inventionSections = projectSections.map(([key, label]) => [
  key,
  {
    basic: "项目基本情况",
    details: "技术原理、技术方法与核心措施",
    comparison: "产品、工艺或材料发明内容",
  }[key] || label,
]);

const achievementSections = [
  ["basic", "候选人基本情况"],
  ["honors", "科技奖励与荣誉称号"],
  ["publications", "论文和专著"],
  ["achievementIp", "知识产权证书"],
  ["research", "承担科研项目"],
  ["engineering", "重大工程技术项目"],
  ["transformation", "科技成果转化及推广"],
  ["recommendation", "附件：推荐函与承诺函"],
  ["attachments", "附件：证明材料"],
];

const projectRecommendationMaterials = [
  [
    "recommendation_signed",
    "签章意见附件",
    "上传已填写并加盖单位公章的 PDF 或扫描图片。",
  ],
];

const projectAttachmentMaterials = [
  [
    "ip",
    "知识产权证明",
    "授权发明专利、软件著作权、标准等与项目创新内容直接相关的证明。",
  ],
  [
    "evaluation",
    "评价证明及审批文件",
    "评价证明出具时间应在 2025 年 1 月 1 日后；同时上传国家法律法规要求的审批文件。",
  ],
  [
    "application",
    "主要应用证明",
    "由应用单位出具，说明应用时间、范围、效果及节能减排或经济社会效益。",
  ],
  [
    "other",
    "其他证明",
    "查新报告、检测报告、获奖证明及其他可支撑申报内容的材料。",
  ],
];

const profiles = {
  [AWARD_TYPES.ACHIEVEMENT]: {
    value: AWARD_TYPES.ACHIEVEMENT,
    code: "achievement",
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
        "achievement_papers",
        "代表性论文",
        "提交全文（含封面、目录和正文），不超过 5 篇。",
      ],
      [
        "achievement_books",
        "代表性专著",
        "提交封面、目录等关键页，不超过 8 册。",
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
      achievement_papers: 5,
      achievement_books: 8,
      achievement_other: 20,
    },
  },
  [AWARD_TYPES.PROGRESS]: {
    value: AWARD_TYPES.PROGRESS,
    code: "progress",
    mode: "project",
    subjectLabel: "项目名称",
    summary: "奖励在技术创新、成果应用和产业化方面推动行业科技进步的项目。",
    conditions: "成果实践应用超过 1 年，近 2 年完成国家科技成果登记系统评价。",
    sections: progressSections,
    detailFields: [
      ["background", "1. 立项背景"],
      ["technicalContent", "2. 总体思路与技术方案"],
      ["innovations", "3. 实施效果与技术创新点"],
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
    requiredAttachmentGroups: [],
    fileLimits: {},
  },
  [AWARD_TYPES.INVENTION]: {
    value: AWARD_TYPES.INVENTION,
    code: "invention",
    mode: "project",
    subjectLabel: "项目名称",
    summary:
      "奖励国内外首创并在新工艺、新材料、新系统能效提升方面取得突破的技术发明。",
    conditions:
      "成果试验、应用超过 2 年，近 2 年完成国家科技成果登记系统评价。",
    sections: inventionSections,
    detailFields: [
      ["background", "1. 技术原理与技术方法"],
      ["technicalContent", "2. 产品、工艺或材料发明内容"],
      ["innovations", "3. 核心技术措施与技术发明点"],
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
    requiredAttachmentGroups: [],
    fileLimits: {},
  },
};

export const awardProfiles = Object.freeze(Object.values(profiles));

export function getAwardProfile(value) {
  return profiles[value] || profiles[AWARD_TYPES.PROGRESS];
}

export function getAwardSections(value) {
  return getAwardProfile(value).sections.map(([key, label]) => ({
    key,
    label,
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
      { key: "transformation", label: "科技成果转化及推广" },
    ];
  }
  return [
    { key: "projectName", label: "项目名称" },
    { key: "applicantUnit", label: "第一申报单位" },
    ...((profile.submissionFields || []).map(([key, label]) => ({
      key,
      label,
    }))),
    { key: "people", label: "主要完成人" },
    { key: "units", label: "主要完成单位" },
  ];
}
