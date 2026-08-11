const { defineConfig } = require("@playwright/test");
const path = require("node:path");

module.exports = defineConfig({
  testDir: __dirname,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    channel: "chrome",
  },
  webServer: {
    command: "npx http-server _site -p 4174 -c-1",
    cwd: path.resolve(__dirname, "../.."),
    url: "http://127.0.0.1:4174",
    reuseExistingServer: !process.env.CI,
  },
});
