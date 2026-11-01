import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./apps/site/tests/browser",
  testMatch: "**/*.test.mjs",
  timeout: 60_000,
  workers: 2,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: "test-results/browser",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
});
