import assert from "node:assert/strict";
import test from "node:test";
import {
  AWARD_TYPES,
  getAwardProfile,
  getAwardSections,
  getSubmissionRequirements,
} from "../src/award-profiles.js";

test("achievement applications use a candidate-specific material structure", () => {
  const profile = getAwardProfile(AWARD_TYPES.ACHIEVEMENT);

  assert.equal(profile.mode, "individual");
  assert.equal(profile.subjectLabel, "候选人姓名");
  assert.equal(profile.fileLimits.achievement_other, 20);
  assert.equal(profile.fileLimits.achievement_publications, 5);
  assert.equal(profile.requiredAttachmentGroups.length, 5);
  assert.deepEqual(
    getAwardSections(profile.value).map(({ key }) => key),
    [
      "basic",
      "honors",
      "publications",
      "achievementIp",
      "research",
      "engineering",
      "transformation",
      "attachments",
      "authenticity",
      "integrity",
    ],
  );
  assert.equal(
    getAwardSections(profile.value).some(({ key }) => key === "units"),
    false,
  );
  assert.deepEqual(
    getSubmissionRequirements(profile.value).map(({ key }) => key),
    [
      "projectName",
      "applicantUnit",
      "candidate.workUnit",
      "candidate.birthDate",
      "workSummary",
      "transformation",
    ],
  );
});

test("project awards share a skeleton but keep distinct guidance and limits", () => {
  const progress = getAwardProfile(AWARD_TYPES.PROGRESS);
  const invention = getAwardProfile(AWARD_TYPES.INVENTION);

  assert.equal(progress.mode, "project");
  assert.equal(invention.mode, "project");
  assert.deepEqual(
    getAwardSections(progress.value).map(({ key }) => key),
    getAwardSections(invention.value).map(({ key }) => key),
  );
  assert.equal(progress.detailContentLabel, "详细技术内容或科学研究内容");
  assert.equal(invention.detailContentLabel, "技术原理、技术方法及核心措施");
  assert.equal(progress.innovationLabel, "主要技术创新点");
  assert.equal(invention.innovationLabel, "主要技术发明点");
  assert.equal(progress.comparisonLabel, "主要技术创新点、应用推广和行业进步");
  assert.equal(invention.comparisonLabel, "知识产权依据");
  assert.equal(progress.submissionFields.length, 6);
  assert.equal(invention.submissionFields.length, 6);
  assert.equal(progress.minimumApplicationYears, 1);
  assert.equal(invention.minimumApplicationYears, 2);
  assert.equal(progress.maxPeople, 15);
  assert.equal(invention.maxPeople, 10);
  assert.equal(getAwardSections(progress.value).length, 13);
  assert.equal(
    getAwardSections(invention.value)[12].templateFile,
    "十三、诚信承诺书.doc",
  );
});

test("unknown award values fall back to the progress profile", () => {
  assert.equal(getAwardProfile("历史奖项").value, AWARD_TYPES.PROGRESS);
});
