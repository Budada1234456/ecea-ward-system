import assert from "node:assert/strict";
import { openAsBlob } from "node:fs";
import path from "node:path";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
if (!adminPassword)
  throw new Error("请通过 TEST_ADMIN_PASSWORD 提供管理员测试密码");
const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ account: "admin", password: adminPassword }),
});
assert.equal(loginResponse.ok, true, "Test account login failed");
const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
const pdfPath = path.resolve(
  "节能奖填报材料",
  "中国节能协会创新奖申报书-规模化分布式光伏安全灵活接入与节能运行控制技术及应用.pdf",
);
const body = new FormData();
body.append("file", await openAsBlob(pdfPath), path.basename(pdfPath));

const response = await fetch(`${baseUrl}/api/extract-pdf`, {
  method: "POST",
  headers: { Cookie: sessionCookie },
  body,
});
const payload = await response.json();

assert.equal(response.ok, true, payload.message);
assert.equal(payload.fields.people[0], "李建威");
assert.equal(payload.fields.people.length, 15);
assert.deepEqual(payload.fields.units.slice(0, 3), [
  "国网江苏省电力有限公司",
  "北京理工大学",
  "中国电力科学研究院有限公司",
]);
assert.equal(payload.fields.applicantUnit, "国网江苏省电力有限公司");
assert.equal(
  /[^\n]\n[^\n]/.test(payload.fields.introduction),
  false,
  "Physical PDF line wraps should be joined",
);
assert.ok(payload.ocrPages >= 1, "Scanned cover page should trigger local OCR");
assert.match(
  payload.fields.projectNameEn || "",
  /Safe and Flexible Large-Scale Integration/i,
);
assert.equal(payload.fields.startDate, "2017-01-01");
assert.equal(payload.fields.endDate, "2023-12-31");
assert.deepEqual(payload.fields.sources, ["A", "E"]);
assert.equal(payload.fields.plans.split("\n").length, 4);
assert.match(payload.fields.plans, /2018YFB1500801/);
assert.match(payload.fields.plans, /SGTYHT\/16-JS-198/);
for (const key of [
  "projectName",
  "introduction",
  "background",
  "technicalContent",
  "innovations",
  "comparison",
  "application",
  "economic",
  "social",
]) {
  assert.ok(payload.fields[key], `Missing extracted field: ${key}`);
}

console.log(
  JSON.stringify({
    pages: `${payload.analyzedPages}/${payload.totalPages}`,
    firstPerson: payload.fields.people[0],
    people: payload.fields.people.length,
    units: payload.fields.units.length,
    recognized: payload.recognized.length,
    englishName: payload.fields.projectNameEn,
    ocrPages: payload.ocrPages,
  }),
);
