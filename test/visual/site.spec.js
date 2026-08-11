const { test, expect } = require("@playwright/test");

const routes = [
  { path: "/", slug: "about", heading: /Xin.*Liu/ },
  { path: "/news/", slug: "news", heading: /news/i },
  { path: "/publications/", slug: "publications", heading: /Publications/ },
  { path: "/repositories/", slug: "software", heading: /Software/ },
];

for (const route of routes) {
  for (const theme of ["light", "dark"]) {
    test(`${route.slug} ${theme}`, async ({ page }) => {
      await page.addInitScript((selectedTheme) => localStorage.setItem("theme", selectedTheme), theme);
      await page.route("https://github-readme-stats-git-master-xins-projects-65bbce1e.vercel.app/**", async (request) => {
        const requestUrl = new URL(request.request().url());
        const repositoryName = `${requestUrl.searchParams.get("username")}/${requestUrl.searchParams.get("repo")}`;
        const isDarkCard = requestUrl.searchParams.get("theme") === "dark";
        const cardBackground = isDarkCard ? "#202124" : "#f8fafc";
        const cardText = isDarkCard ? "#f3f4f6" : "#1f2937";
        await request.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195"><rect width="100%" height="100%" rx="8" fill="${cardBackground}" stroke="#6b7280"/><text x="28" y="72" fill="${cardText}" font-family="Arial" font-size="22" font-weight="700">${repositoryName}</text><text x="28" y="112" fill="${cardText}" font-family="Arial" font-size="16">Repository card preview</text></svg>`,
        });
      });
      await page.route(/(?:cloudfront\.net|badge\.dimensions\.ai)/, (request) => request.abort());
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

      const navLabels = await page.locator("#navbarNav .nav-link").allTextContents();
      expect(navLabels.map((label) => label.replace("(current)", "").trim()).filter(Boolean)).toEqual(["About", "Publications", "Software", "CV"]);
      await expect(page.locator('a[aria-label="CV (PDF)"]')).toHaveAttribute("href", "/assets/pdf/CV_Xin_Liu.pdf");

      if (route.slug === "about") {
        await expect(page.locator(".profile img")).toHaveAttribute("alt", "Portrait of Xin Liu");
        await expect(page.getByRole("heading", { name: "News" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Selected Publications" })).toBeVisible();
      }
      if (route.slug === "publications") {
        expect(await page.locator(".publications img.preview").count()).toBe(26);
      }
      if (route.slug === "software") {
        expect(await page.locator('.repositories a[href*="github.com/"]').count()).toBeGreaterThanOrEqual(6);
        await page.locator(".repo").evaluateAll((cards) => {
          const dark = document.documentElement.dataset.theme === "dark";
          for (const card of cards) {
            const repositoryName = card.querySelector("img").alt;
            card.querySelectorAll("img").forEach((image) => image.remove());
            const fixture = document.createElement("div");
            fixture.className = "visual-repo-fixture";
            fixture.style.cssText = `box-sizing:border-box;height:195px;padding:44px 28px;text-align:left;border:1px solid #6b7280;border-radius:8px;background:${dark ? "#202124" : "#f8fafc"};color:${dark ? "#f3f4f6" : "#1f2937"};position:relative;z-index:2`;
            fixture.innerHTML = `<strong style="display:block;font-size:22px">${repositoryName}</strong><span style="display:block;margin-top:16px;font-size:16px">Repository card preview</span>`;
            card.querySelector("a").append(fixture);
          }
        });
        await expect(page.locator(".visual-repo-fixture")).toHaveCount(6);
        await expect(page.locator(".visual-repo-fixture").first()).toBeVisible();
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page).toHaveScreenshot(`${route.slug}-${theme}.png`, {
        caret: "hide",
        fullPage: false,
      });
    });
  }
}
