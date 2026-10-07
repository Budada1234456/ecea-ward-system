import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCIPLINE_STATUS,
  createDefaultTableRecord,
  derivePrimaryDiscipline,
  normalizeApplicationData,
  normalizeDisciplineSelection,
  normalizeEntityRecords,
} from "../src/forms/data-contract.js";
import {
  FIELD_GROUPS,
  getPdfFields,
  tableFields,
} from "../src/schema/table-fields.js";
import { reorderAndRenumber } from "../src/utils/reorder.js";

test("schema keeps field and PDF order aligned", () => {
  assert.deepEqual(Object.keys(tableFields), FIELD_GROUPS);
  for (const group of FIELD_GROUPS) {
    const fields = tableFields[group];
    assert.ok(
      fields.every(({ hint }) => typeof hint === "string" && hint.trim()),
    );
    assert.equal(new Set(fields.map(({ key }) => key)).size, fields.length);
    assert.deepEqual(
      getPdfFields(group).map(({ key }) => key),
      fields.filter(({ pdfVisible }) => pdfVisible).map(({ key }) => key),
    );
  }
});

test("primary discipline follows the first selection after normalization", () => {
  const source = [
    {
      name: "第一学科",
      code: "4806010",
      status: DISCIPLINE_STATUS.CONFIRMED,
      path: ["480", "48060", "4806010"],
    },
    "历史自由文本",
  ];
  const data = normalizeApplicationData({ disciplines: source });
  assert.deepEqual(
    derivePrimaryDiscipline(data.disciplines),
    data.disciplines[0],
  );
  assert.equal(derivePrimaryDiscipline(data.disciplines).code, "4806010");
  assert.equal(
    derivePrimaryDiscipline([...data.disciplines].reverse()).name,
    "历史自由文本",
  );
  assert.equal(derivePrimaryDiscipline([]), null);
});

test("all repeated groups receive deterministic unique legacy ids", () => {
  const groups = FIELD_GROUPS.filter((group) => group !== "economicSummary");
  const input = Object.fromEntries(groups.map((group) => [group, [{}, {}]]));
  const first = normalizeApplicationData(input);
  const second = normalizeApplicationData(input);

  for (const group of groups) {
    const ids = first[group].map(({ id }) => id);
    assert.equal(ids.every(Boolean), true);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(
      second[group].map(({ id }) => id),
      ids,
    );
    assert.ok(createDefaultTableRecord(group, 0).id);
  }
});

test("legacy achievement applications reuse the first person as candidate data", () => {
  const data = normalizeApplicationData({
    awardType: "节能减排科技成就奖",
    applicationMode: "individual",
    people: [
      {
        name: "历史候选人",
        birthDate: "1980-01-01",
        workUnit: "历史工作单位",
        technicalTitle: "研究员",
      },
    ],
  });

  assert.equal(data.candidate.name, "历史候选人");
  assert.equal(data.candidate.birthDate, "1980-01-01");
  assert.equal(data.candidate.workUnit, "历史工作单位");
  assert.equal(data.candidate.technicalTitle, "研究员");
});

test("a confirmed discipline stores its terminal code and complete path", () => {
  const [discipline] = normalizeDisciplineSelection([
    {
      code: "4806010",
      name: "煤炭能",
      level: 3,
      parentCode: "48060",
      path: ["480", "48060", "4806010"],
      status: DISCIPLINE_STATUS.CONFIRMED,
    },
  ]);

  assert.equal(discipline.id, "discipline-4806010");
  assert.equal(discipline.code, "4806010");
  assert.deepEqual(discipline.path, ["480", "48060", "4806010"]);
});

test("entity ordering preserves ids and renumbers rank", () => {
  const reordered = reorderAndRenumber(
    [
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
    ],
    1,
    0,
  );
  assert.deepEqual(reordered, [
    { id: "b", rank: 1 },
    { id: "a", rank: 2 },
  ]);
});

test("legacy entity records receive stable unique ids before reordering", () => {
  const records = normalizeEntityRecords("people", [
    { name: "甲", id: "duplicate" },
    { name: "乙", id: "duplicate" },
    { name: "丙" },
  ]);
  assert.deepEqual(
    records.map(({ id }) => id),
    ["duplicate", "person-legacy-2-1", "person-legacy-3"],
  );
  assert.deepEqual(
    reorderAndRenumber(records, 2, 0).map(({ name, rank, id }) => ({
      name,
      rank,
      id,
    })),
    [
      { name: "丙", rank: 1, id: "person-legacy-3" },
      { name: "甲", rank: 2, id: "duplicate" },
      { name: "乙", rank: 3, id: "person-legacy-2-1" },
    ],
  );
});

test("empty legacy ranks fall back to display order", () => {
  const data = normalizeApplicationData({
    people: [{ name: "甲", rank: "" }],
    units: [{ name: "乙", rank: null }],
  });
  assert.equal(data.people[0].rank, 1);
  assert.equal(data.units[0].rank, 1);
});

test("incomplete confirmed disciplines are downgraded to pending", () => {
  const [missingPath, truncatedPath] = normalizeDisciplineSelection([
    { code: "4806010", name: "煤炭能", level: 3, status: "confirmed" },
    {
      code: "4806010",
      name: "煤炭能",
      level: 3,
      path: ["480", "4806010"],
      status: "confirmed",
    },
  ]);
  assert.equal(missingPath.status, DISCIPLINE_STATUS.PENDING);
  assert.equal(truncatedPath.status, DISCIPLINE_STATUS.PENDING);
});


test("achievement resume preserves legacy content and structured month records", () => {
  const legacy = normalizeApplicationData({ resume: "<p>旧简历</p>" });
  assert.equal(legacy.resumeRecords[0].content, "<p>旧简历</p>");
  assert.equal(legacy.resumeRecords[0].startMonth, "");
  const rows = [{ id: "r1", startMonth: "2000-09", endMonth: "2004-06", content: "大学专业" }];
  const normalized = normalizeApplicationData({ resumeRecords: rows, candidate: { postalCode: "100001", homePostalCode: "200001" } });
  assert.deepEqual(normalized.resumeRecords, rows);
  assert.equal(normalized.candidate.postalCode, "100001");
  assert.equal(normalized.candidate.homePostalCode, "200001");
  assert.deepEqual(normalizeApplicationData({ resume: "旧简历", resumeRecords: [] }).resumeRecords, []);
});

test("achievement template fields survive normalization", () => {
  const normalized = normalizeApplicationData({
    awardType: "节能减排科技成就奖",
    awardRecords: [{ name: "荣誉", totalPeople: "5", personalRank: "2" }],
    paperRecords: [{ basicInformation: "论文", contribution: "贡献" }],
    ipRecords: [{ name: "专利", certificateNumber: "C-1", owner: "单位" }],
    researchRecords: [{ name: "项目", funding: "10", leader: "张三" }],
    engineeringRecords: [{ name: "工程", client: "甲方", economicBenefit: "20" }],
  });
  assert.equal(normalized.awardRecords[0].totalPeople, "5");
  assert.equal(normalized.awardRecords[0].personalRank, "2");
  assert.equal(normalized.paperRecords[0].contribution, "贡献");
  assert.equal(normalized.ipRecords[0].certificateNumber, "C-1");
  assert.equal(normalized.researchRecords[0].funding, "10");
  assert.equal(normalized.engineeringRecords[0].client, "甲方");
});
