import assert from "node:assert/strict";
import test from "node:test";

import { AWARD_TYPES } from "../src/award-profiles.js";
import {
  LONG_TEXT_LIMITS,
  validateApplication,
  validateSection,
} from "../src/forms/application-validation.js";

test("long-text limits match the split Word templates", () => {
  assert.equal(LONG_TEXT_LIMITS.introduction, 800);
  assert.equal(LONG_TEXT_LIMITS.innovations, 800);
  assert.equal(LONG_TEXT_LIMITS.application, 800);
  assert.equal(LONG_TEXT_LIMITS.economic, 300);
  assert.equal(LONG_TEXT_LIMITS.social, 300);
  assert.equal(LONG_TEXT_LIMITS.transformation, 800);
  assert.equal(LONG_TEXT_LIMITS.workSummary, 1000);
  assert.equal(LONG_TEXT_LIMITS.unitContribution, 500);
});

test("a section rejects missing required fields and text over its limit", () => {
  const missing = validateSection({
    awardType: AWARD_TYPES.PROGRESS,
    sectionKey: "introduction",
    data: { introduction: "" },
  });
  assert.deepEqual(
    missing.map(({ message }) => message),
    ["请填写项目简介"],
  );

  const overLimit = validateSection({
    awardType: AWARD_TYPES.PROGRESS,
    sectionKey: "introduction",
    data: { introduction: `<p>${"节".repeat(1001)}</p>` },
  });
  assert.deepEqual(
    overLimit.map(({ message }) => message),
    ["项目简介不得超过 800 字（当前 1001 字）"],
  );
});

test("attachments are optional for every award", () => {
  for (const awardType of Object.values(AWARD_TYPES)) {
    assert.deepEqual(
      validateSection({
        awardType,
        sectionKey: "attachments",
        data: { awardType },
        files: [],
      }),
      [],
    );
  }
});

test("full validation catches incomplete basic and entity fields before preview", () => {
  const errors = validateApplication({
    awardType: AWARD_TYPES.PROGRESS,
    data: {
      awardType: AWARD_TYPES.PROGRESS,
      year: "2026",
      people: [{ id: "person-1", name: "张三" }],
      units: [{ id: "unit-1", name: "示例单位" }],
    },
    files: [],
  });
  assert(
    errors.some(
      ({ sectionKey, key }) => sectionKey === "basic" && key === "projectName",
    ),
  );
  assert(
    errors.some(
      ({ sectionKey, key }) =>
        sectionKey === "people" && key.endsWith(".workUnit"),
    ),
  );
  assert(
    errors.some(
      ({ sectionKey, key }) =>
        sectionKey === "units" && key.endsWith(".nature"),
    ),
  );
});
