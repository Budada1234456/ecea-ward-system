import assert from "node:assert/strict";
import {
  DISCIPLINE_DATASET_META,
  disciplines,
  validateDisciplineRecords,
} from "../src/data/disciplines.js";
import {
  getDisciplineOptions,
  SEARCH_RESULT_LIMIT,
} from "../src/forms/discipline-options.js";

const byCode = new Map(disciplines.map((record) => [record.code, record]));

assert.equal(disciplines.length, 3532);
assert.equal(byCode.size, disciplines.length);
assert.deepEqual(
  Object.fromEntries(
    [1, 2, 3].map((level) => [
      level,
      disciplines.filter((record) => record.level === level).length,
    ]),
  ),
  { 1: 62, 2: 738, 3: 2732 },
);
assert.deepEqual(validateDisciplineRecords(), { valid: true, errors: [] });

for (const [code, name] of Object.entries({
  110: "数学",
  1101410: "演绎逻辑学",
  18067: "人类学",
  1806799: "人类学其他学科",
  19030: "发展心理学",
  480: "能源科学技术",
  91099: "统计学其他学科",
})) {
  assert.equal(byCode.get(code)?.name, name, `${code} name must match Table 1`);
}

assert.deepEqual(byCode.get("1903510"), {
  code: "1903510",
  name: "婴儿心理学",
  level: 3,
  parentCode: "19030",
  path: ["190", "19030", "1903510"],
});
assert.equal(DISCIPLINE_DATASET_META.sourceStatus, "verified-table-extraction");
assert.equal(
  DISCIPLINE_DATASET_META.sourceSha256,
  "E6FE7693A8F199F304E91157A5BD5B0BDAF914EBDA275F1A36F7F7FAA8403E53",
);
assert.equal(DISCIPLINE_DATASET_META.recordCount, disciplines.length);

const defaultOptions = getDisciplineOptions(disciplines);
assert.equal(defaultOptions.length, 62);
assert.ok(defaultOptions.every((record) => record.level === 1));
assert.equal(defaultOptions[0].name, "数学");
assert.ok(defaultOptions.some((record) => record.name === "能源科学技术"));
assert.ok(defaultOptions.some((record) => record.name === "统计学"));

const levelTwoOptions = getDisciplineOptions(disciplines, "", 2);
assert.equal(levelTwoOptions.length, 738);
assert.ok(levelTwoOptions.every((record) => record.level === 2));

const levelThreeOptions = getDisciplineOptions(disciplines, "", 3);
assert.equal(levelThreeOptions.length, 2732);
assert.ok(levelThreeOptions.every((record) => record.level === 3));

assert.deepEqual(
  getDisciplineOptions(disciplines, "婴儿心理学").map(({ code, level }) => ({
    code,
    level,
  })),
  [{ code: "1903510", level: 3 }],
);
assert.ok(
  getDisciplineOptions(disciplines, "480").some(({ code }) => code === "480"),
);
assert.ok(
  getDisciplineOptions(disciplines, "学").length <= SEARCH_RESULT_LIMIT,
);

console.log(
  `Validated ${disciplines.length} GB/T 13745-2009 discipline records.`,
);
