import { expect, test } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:4174";

test("health endpoint reports whether the backend needs a restart", async ({
  request,
}) => {
  const response = await request.get(`${baseUrl}/api/health`);
  expect(response.ok(), await response.text()).toBe(true);

  const health = await response.json();
  expect(Date.parse(health.backendStartedAt)).not.toBeNaN();
  expect(Date.parse(health.backendSourceModifiedAt)).not.toBeNaN();
  expect(health.restartRequired).toBe(false);
});
