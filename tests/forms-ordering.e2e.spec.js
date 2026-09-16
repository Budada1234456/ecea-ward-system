import { expect, test } from "@playwright/test";
import {
  DISCIPLINE_STATUS,
  createDefaultApplicationData,
  createDefaultTableRecord,
  normalizeApplicationData,
  normalizeDisciplineSelection,
  normalizeTableRecord,
} from "../src/forms/data-contract.js";
import {
  FIELD_GROUPS,
  createDefaultRecord,
  getFieldDefinition,
  getPdfFields,
  tableFields,
} from "../src/schema/table-fields.js";
import {
  canMoveDown,
  canMoveUp,
  moveItem,
  reorderAndRenumber,
} from "../src/utils/reorder.js";
import { validateDisciplineRecords } from "../src/data/disciplines.js";
import {
  getDisciplineChildren,
  getDisciplinePath,
} from "../src/forms/discipline-options.js";

test.describe("form data contract", () => {
  test("schema exposes ordered unique fields with export metadata", () => {
    expect(Object.keys(tableFields)).toEqual(FIELD_GROUPS);

    for (const group of FIELD_GROUPS) {
      const fields = tableFields[group];
      expect(fields.length).toBeGreaterThan(0);
      expect(new Set(fields.map(({ key }) => key)).size).toBe(fields.length);
      for (const field of fields) {
        expect(field.label).toBeTruthy();
        expect(field.wordKey).toBe(`${group}.${field.key}`);
        expect(typeof field.pdfVisible).toBe("boolean");
      }
    }

    expect(getPdfFields("people").map(({ key }) => key)).toEqual(
      tableFields.people
        .filter(({ pdfVisible }) => pdfVisible)
        .map(({ key }) => key),
    );
  });

  test("all repeated record groups receive stable unique ids", () => {
    const repeatedGroups = FIELD_GROUPS.filter(
      (group) => group !== "economicSummary",
    );
    const input = Object.fromEntries(
      repeatedGroups.map((group) => [group, [{}, {}]]),
    );
    const first = normalizeApplicationData(input);
    const second = normalizeApplicationData(input);

    for (const group of repeatedGroups) {
      const ids = first[group].map(({ id }) => id);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(2);
      expect(second[group].map(({ id }) => id)).toEqual(ids);
      expect(createDefaultTableRecord(group, 0).id).toBeTruthy();
    }
  });

  test("defaults keep economic summary separate from record collections", () => {
    const value = createDefaultApplicationData();

    expect(value.economicSummary).toEqual({
      totalInvestment: "",
      paybackYears: "",
    });
    expect(value.economicRecords).toEqual([]);
    expect(value.people).toEqual([]);
    expect(value.units).toEqual([]);
    expect(createDefaultRecord("awardRecords")).toEqual({
      name: "",
      date: "",
      award: "",
      level: "",
      org: "",
    });
  });

  test("legacy data is normalized without losing unrelated fields", () => {
    const legacy = {
      unrelated: { retained: true },
      people: ["张三", { id: "person-b", name: "李四", rank: "9", extra: 1 }],
      units: ["甲单位", { id: "unit-b", name: "乙单位", rank: "8" }],
      disciplines: ["能源", "材料"],
      ipRecords: [{ name: "发明", number: "ZL-1", imported: true }],
    };

    const value = normalizeApplicationData(legacy);

    expect(value.unrelated).toEqual({ retained: true });
    expect(
      value.people.map(({ id, name, rank }) => ({ id, name, rank })),
    ).toEqual([
      { id: "person-legacy-1", name: "张三", rank: 1 },
      { id: "person-b", name: "李四", rank: 2 },
    ]);
    expect(value.people[1].extra).toBe(1);
    expect(value.units.map(({ rank }) => rank)).toEqual([1, 2]);
    expect(value.ipRecords[0]).toMatchObject({
      authorizationNumber: "ZL-1",
      number: "ZL-1",
      imported: true,
    });
  });

  test("duplicate legacy entity ids receive deterministic replacements", () => {
    const input = {
      people: [
        { id: "same", name: "甲" },
        { id: "same", name: "乙" },
      ],
    };
    const first = normalizeApplicationData(input);
    const second = normalizeApplicationData(input);

    expect(first.people.map(({ id }) => id)).toEqual([
      "same",
      "person-legacy-2-1",
    ]);
    expect(second.people.map(({ id }) => id)).toEqual(
      first.people.map(({ id }) => id),
    );
  });

  test("legacy disciplines remain pending and never receive inferred codes", () => {
    expect(normalizeDisciplineSelection(["  能源科学技术  ", ""])).toEqual([
      {
        id: "discipline-legacy-1",
        code: null,
        name: "能源科学技术",
        level: null,
        parentCode: null,
        path: [],
        status: DISCIPLINE_STATUS.PENDING,
      },
    ]);
  });

  test("official disciplines require both a code and confirmed status", () => {
    const [confirmed, incomplete] = normalizeDisciplineSelection([
      {
        code: "4806010",
        name: "煤炭能",
        level: 3,
        path: ["480", "48060", "4806010"],
        status: "confirmed",
      },
      { name: "待定学科", status: "confirmed" },
    ]);

    expect(confirmed.status).toBe(DISCIPLINE_STATUS.CONFIRMED);
    expect(confirmed.id).toBe("discipline-4806010");
    expect(confirmed.path).toEqual(["480", "48060", "4806010"]);
    expect(incomplete.status).toBe(DISCIPLINE_STATUS.PENDING);
  });

  test("discipline validation accepts child records before their parents", () => {
    const result = validateDisciplineRecords([
      {
        code: "48010",
        name: "二级学科",
        level: 2,
        parentCode: "480",
        path: ["480", "48010"],
      },
      {
        code: "480",
        name: "一级学科",
        level: 1,
        parentCode: null,
        path: ["480"],
      },
    ]);

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test("discipline validation rejects an invalid hierarchy path", () => {
    const result = validateDisciplineRecords([
      {
        code: "480",
        name: "一级学科",
        level: 1,
        parentCode: null,
        path: ["480"],
      },
      {
        code: "48010",
        name: "二级学科",
        level: 2,
        parentCode: "480",
        path: ["48010"],
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "invalid path for 48010: expected 480 > 48010",
    );
  });

  test("discipline tree exposes direct children and complete paths", () => {
    const records = [
      {
        code: "480",
        name: "能源科学技术",
        level: 1,
        parentCode: null,
        path: ["480"],
      },
      {
        code: "48010",
        name: "能源科学技术基础学科",
        level: 2,
        parentCode: "480",
        path: ["480", "48010"],
      },
      {
        code: "4801010",
        name: "能源史",
        level: 3,
        parentCode: "48010",
        path: ["480", "48010", "4801010"],
      },
    ];

    expect(
      getDisciplineChildren(records, null).map(({ code }) => code),
    ).toEqual(["480"]);
    expect(
      getDisciplineChildren(records, "480").map(({ code }) => code),
    ).toEqual(["48010"]);
    expect(
      getDisciplinePath(records, "4801010").map(({ code }) => code),
    ).toEqual(["480", "48010", "4801010"]);
  });

  test("legacy IP number maps to the canonical authorization number", () => {
    const record = normalizeTableRecord("ipRecords", {
      number: "CN-100",
      authorizationNumber: undefined,
    });
    expect(record.authorizationNumber).toBe("CN-100");
    expect(
      getFieldDefinition("ipRecords", "authorizationNumber").legacyKeys,
    ).toEqual(["number"]);
  });
});

test.describe("ordering contract", () => {
  test("move is immutable and preserves stable identity", () => {
    const input = [
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
      { id: "c", rank: 3 },
    ];
    const output = reorderAndRenumber(input, 0, 2);

    expect(output.map(({ id, rank }) => ({ id, rank }))).toEqual([
      { id: "b", rank: 1 },
      { id: "c", rank: 2 },
      { id: "a", rank: 3 },
    ]);
    expect(input.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(output).not.toBe(input);
  });

  test("invalid moves return a shallow copy without changing order", () => {
    const input = [{ id: "a" }, { id: "b" }];
    const output = moveItem(input, -1, 1);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(canMoveUp(0)).toBe(false);
    expect(canMoveUp(1)).toBe(true);
    expect(canMoveDown(0, 2)).toBe(true);
    expect(canMoveDown(1, 2)).toBe(false);
  });
});
