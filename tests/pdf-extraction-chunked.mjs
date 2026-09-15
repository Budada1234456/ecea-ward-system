import assert from "node:assert/strict";
import fs from "node:fs/promises";
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
const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
const pdfPath = process.env.TEST_PDF_PATH
  ? path.resolve(process.env.TEST_PDF_PATH)
  : path.resolve(
      "节能奖填报材料",
      "附件1.中国节能协会创新奖奖励办法（2026修订版）-1.pdf",
    );
const expectedPages = Number(process.env.TEST_EXPECTED_PAGES || 15);
const file = await fs.readFile(pdfPath);

const createResponse = await fetch(`${baseUrl}/api/pdf-uploads`, {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ fileName: path.basename(pdfPath), size: file.length }),
});
const upload = await createResponse.json();
assert.equal(createResponse.status, 201, upload.message);
assert.ok(upload.uploadId);

for (let index = 0; index < upload.totalChunks; index += 1) {
  const start = index * upload.chunkSize;
  const chunkResponse = await fetch(
    `${baseUrl}/api/pdf-uploads/${upload.uploadId}/chunks/${index}`,
    {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/octet-stream" },
      body: file.subarray(
        start,
        Math.min(start + upload.chunkSize, file.length),
      ),
    },
  );
  assert.equal(chunkResponse.ok, true, await chunkResponse.text());
}

const completeResponse = await fetch(
  `${baseUrl}/api/pdf-uploads/${upload.uploadId}/complete`,
  { method: "POST", headers: { Cookie: cookie } },
);
const accepted = await completeResponse.json();
assert.equal(completeResponse.status, 202, accepted.message);
const repeatedCompleteResponse = await fetch(
  `${baseUrl}/api/pdf-uploads/${upload.uploadId}/complete`,
  { method: "POST", headers: { Cookie: cookie } },
);
const repeated = await repeatedCompleteResponse.json();
assert.equal(repeatedCompleteResponse.status, 202, repeated.message);
assert.equal(repeated.jobId, accepted.jobId);

const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  const response = await fetch(`${baseUrl}/api/extract-pdf/${accepted.jobId}`, {
    headers: { Cookie: cookie },
  });
  const status = await response.json();
  if (status.status === "completed") {
    assert.equal(status.result.totalPages, expectedPages);
    console.log(
      JSON.stringify({
        status: status.status,
        pages: status.result.totalPages,
      }),
    );
    process.exit(0);
  }
  assert.notEqual(status.status, "failed", status.message);
  await new Promise((resolve) => setTimeout(resolve, 500));
}
throw new Error("Chunked PDF extraction did not complete");
