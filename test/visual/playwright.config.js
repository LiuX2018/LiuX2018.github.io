const { defineConfig, devices } = require("@playwright/test");
const path = require("node:path");
const siteDirectory = process.env.SITE_DIR || "_site";
const browserLaunchOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" };

module.exports = defineConfig({
  testDir: __dirname,
  outputDir: "../../output/playwright/test-results",
  reporter: [["list"], ["html", { outputFolder: "../../output/playwright/report", open: "never" }]],
  snapshotPathTemplate: "{testDir}/snapshots/{platform}/{projectName}/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.015,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    ...browserLaunchOptions,
    colorScheme: "light",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: `npx --yes http-server ${JSON.stringify(siteDirectory)} -p 4173 -c-1`,
    cwd: path.resolve(__dirname, "../.."),
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
