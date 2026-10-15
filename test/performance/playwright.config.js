const { defineConfig } = require("@playwright/test");
const path = require("node:path");

module.exports = defineConfig({
  testDir: __dirname,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }),
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true } },
    { name: "small-mobile", use: { viewport: { width: 320, height: 823 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `node node_modules/http-server/bin/http-server ${JSON.stringify(process.env.SITE_DIR || "_site")} -p 4175 -c-1`,
    cwd: path.resolve(__dirname, "../.."),
    url: "http://127.0.0.1:4175",
    reuseExistingServer: !process.env.CI,
  },
});
