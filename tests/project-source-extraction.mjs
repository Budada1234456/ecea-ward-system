import assert from "node:assert/strict";

import { extractProjectSourceFields } from "../lib/pdf-fields.mjs";

const scannedCoverText = `
、 仪 国 家 计 划 B. 部 委 计 划 _C. 省 、 市 、 自 治 区 计 划 D. 基 金 资 助
项 目 来 源
时 企 业 F 国 际 合 作 G. 自 选 H 其 它
(1) 2018 年 国 家 重 点 研 发 计 划 《 差 异 化 场 景 下 分 布 式 光 伏 数 据 采 集 、 传
输 及 存 储 技 术 》 ( 计 划 编 号 : 2018YFB1500801) :
(2 ) 2020 年 国 家 电 网 公 司 总 部 科 技 项 目 《 能 源 变 革 下 的 城 市 电 网 态 势 感
知 及 调 度 控 制 技 术 研 究 》 ( 计 划 编 号 : 5108-202018026A-0-0-00) :
具 体 计 划 、 基 金 | (3) 2019 年 国 家 电 网 公 司 总 部 科 技 项 目 《 基 于 边 缘 计 算 与 软 件 定 义 终 端
名 称 和 编 号 | 的 配 电 物 联 网 关 键 技 术 研 究 与 应 用 》 ( 计 划 编 号 : 5400-201918138A-0-0-
00
(4) 2017 年 国 家 电 网 公 司 总 部 科 技 项 目 《 适 应 高 渗 透 率 分 布 式 电 源 接 入
的 配 电 网 继 电 保 护 技 术 研 究 》 ( 计 划 编 号 , SGTYHT/16-JS-198》 。
项 目 起 止 时 间 起 始 : 2017 年 1 月 1 日 完 成 : 2023 年 12 月 31 日
`;

const scanned = extractProjectSourceFields(scannedCoverText);
assert.deepEqual(scanned.sources, ["A", "E"]);
assert.equal(scanned.plans.split("\n").length, 4);
assert.match(scanned.plans, /2018YFB1500801/);
assert.match(scanned.plans, /5108-202018026A-0-0-00/);
assert.match(scanned.plans, /5400-201918138A-0-0-00/);
assert.match(scanned.plans, /SGTYHT\/16-JS-198/);

const digital = extractProjectSourceFields(`
项目来源 ☑A.国家计划 □B.部委计划 □C.省、市、自治区计划 ☑D.基金资助
□E.企业 □F.国际合作 □G.自选 □H.其它
具体计划、基金名称和编号
（1）国家自然科学基金项目《高效储能技术》（项目编号：52322707）
项目起止时间 2021年1月1日 2024年12月31日
`);
assert.deepEqual(digital.sources, ["A", "D"]);
assert.equal(
  digital.plans,
  "（1）国家自然科学基金项目《高效储能技术》（项目编号：52322707）",
);

console.log("project source and plan extraction passed");
