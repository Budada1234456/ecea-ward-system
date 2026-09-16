const GUIDANCE = Object.freeze({
  introduction: {
    text: "（填写项目所属科学技术领域、核心科技内容、关键技术经济指标、促进行业科技进步的核心作用、实际应用推广范围及效果）",
    max: 800,
    unit: "汉字",
  },
  background: { text: "1．立项背景", max: 800 },
  technicalContent: {
    text: "2．详细技术内容或科学研究内容（纸面不敷可另增页，需系统阐述项目技术原理、研发过程、核心工艺 / 方法 / 算法、技术实现路径、关键配套措施等）",
    note: "纸面不敷可另增页",
  },
  innovations: {
    text: "3．主要发现点或技术发明点或技术创新点（逐条列明核心创新点，明确创新类型、具体内容、与现有技术的本质区别，突出节能减排领域的独特价值）",
    max: 800,
  },
  comparison: {
    text: "4．与当前国内外同类技术的比较（不超过两页）\n（从主要技术参数、节能减排效益（节能量 / 减排量 / 资源利用率等）、市场竞争力（成本 / 效率 / 稳定性 / 适用范围等）三个维度，列表对比本项目与国内外同类先进技术的优劣，明确本项目的技术水平定位）",
    note: "不超过两页",
  },
  application: {
    text: "5．应用情况（填写项目应用时间、应用单位数量 / 范围、实际运行效果、用户反馈、推广前景及已开展的推广措施等）",
    max: 800,
  },
  economic: {
    text: "6．经济效益（标准、软科学类项目可以不填此栏）\n各栏目的计算依据：",
    max: 300,
  },
  social: {
    text: "7．社会效益（填写项目在节能减排、环境保护、资源节约、产业升级、就业带动、公共安全、行业标准完善等方面的社会效益）",
    max: 300,
  },
  technicalEvaluation: {
    text: "2. 技术评价证明及行业审批文件目录",
  },
  peopleCooperation: { text: "完成人合作关系说明" },
  personContribution: {
    text: "对本项目主要科学技术贡献：（简明阐述核心贡献，与创新点对应）",
  },
  unitContribution: {
    text: "（对本项目技术创新和应用的贡献（限 500 字，阐述单位在研发、资金、场地、试验、推广等方面的核心支持与贡献）",
    max: 500,
  },
});

export function getRichTextGuidance(fieldKey) {
  const key = String(fieldKey || "");
  if (/^person-.+-contribution$/.test(key)) return GUIDANCE.personContribution;
  if (/^unit-.+-contribution$/.test(key)) return GUIDANCE.unitContribution;
  return GUIDANCE[key] || null;
}
