const AWARD_DISCIPLINE_NAMES = [
  "能源动力系统节能与减排技术",
  "石油、天然气、化工工艺系统节能与减排技术",
  "矿业、冶金金工艺系统节能与减排技术",
  "机械、轻工工艺系统节能与冰成排技术",
  "动力装备节能与减排技术",
  "矿山科学技术(尾矿综合利用工程)",
  "环境科学技术(废物处理与综合利用)",
];

export const awardDisciplines = Object.freeze(
  AWARD_DISCIPLINE_NAMES.map((name, index) => {
    const code = `AWARD-${String(index + 1).padStart(2, "0")}`;
    return Object.freeze({
      code,
      name,
      level: 1,
      parentCode: null,
      path: Object.freeze([code]),
    });
  }),
);

export default awardDisciplines;