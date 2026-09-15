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
  "附件3.中国节能协会创新奖申报书填写说明-1.pdf",
);
const body = new FormData();
body.append("file", await openAsBlob(pdfPath), path.basename(pdfPath));

const acceptedResponse = await fetch(`${baseUrl}/api/extract-pdf?async=1`, {
  method: "POST",
  headers: { Cookie: sessionCookie },
  body,
});
const accepted = await acceptedResponse.json();
assert.equal(acceptedResponse.status, 202);
assert.equal(accepted.ok, true);
assert.match(accepted.status, /^(queued|processing)$/);
assert.match(accepted.jobId, /^[A-Za-z0-9_-]+$/);

const deadline = Date.now() + 120_000;
let completed;
while (Date.now() < deadline) {
  const statusResponse = await fetch(
    `${baseUrl}/api/extract-pdf/${accepted.jobId}`,
    { headers: { Cookie: sessionCookie } },
  );
  const status = await statusResponse.json();
  assert.equal(statusResponse.ok, true, status.message);
  if (status.status === "completed") {
    completed = status;
    break;
  }
  assert.match(status.status, /^(queued|processing)$/);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

assert.ok(completed, "Asynchronous PDF extraction did not complete");
assert.equal(completed.result.fileName, path.basename(pdfPath));
assert.ok(completed.result.extractedCharacters > 0);
console.log(
  JSON.stringify({
    jobId: accepted.jobId,
    pages: completed.result.totalPages,
    extractedCharacters: completed.result.extractedCharacters,
  }),
);
