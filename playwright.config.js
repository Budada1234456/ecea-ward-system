export default {
  testDir: "./tests",
  testMatch: "e2e.spec.js",
  globalTeardown: "./tests/cleanup-e2e.mjs",
  timeout: 60_000,
  use: {
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  },
};
