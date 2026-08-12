const { defineConfig } = require("@playwright/test");
const path = require("node:path");
const siteDirectory = process.env.SITE_DIR || "_site";
const browserLaunchOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" };

module.exports = defineConfig({
  testDir: __dirname,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    ...browserLaunchOptions,
  },
  webServer: {
    command: `npx http-server ${JSON.stringify(siteDirectory)} -p 4174 -c-1`,
    cwd: path.resolve(__dirname, "../.."),
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
  },
});
