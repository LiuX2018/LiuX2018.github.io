const { test, expect } = require("@playwright/test");

const routes = [
  { path: "/", slug: "about", heading: /Xin.*Liu/ },
  { path: "/news/", slug: "news", heading: /news/i },
  { path: "/publications/", slug: "publications", heading: /Publications/ },
  { path: "/repositories/", slug: "software", heading: /Software/ },
];

for (const route of routes) {
  for (const theme of ["light", "dark"]) {
    test(`${route.slug} ${theme}`, async ({ page }, testInfo) => {
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
        const legendUsesPrimaryTextColor = await page.locator(".publication-legend").evaluate((legend) => {
          const primaryTextColor = getComputedStyle(document.documentElement).getPropertyValue("--global-text-color").trim();
          const probe = document.createElement("span");
          probe.style.color = primaryTextColor;
          document.body.append(probe);
          const expectedColor = getComputedStyle(probe).color;
          probe.remove();
          return getComputedStyle(legend).color === expectedColor;
        });
        expect(legendUsesPrimaryTextColor).toBe(true);
        await expect(page.locator('script[src="https://badge.dimensions.ai/badge.js"]')).toHaveCount(1);
        expect(await page.locator(".publications .__dimensions_badge_embed__").count()).toBeGreaterThan(0);
      }
      if (route.slug === "publications") {
        expect(await page.locator(".publications img.preview").count()).toBe(26);
      }
      if (["about", "publications"].includes(route.slug)) {
        const highlightResult = await page.locator(".publications .publication-note").evaluateAll((notes, selectedTheme) => {
          const parseRgb = (color) =>
            color
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number);
          const luminance = (color) => {
            const channels = parseRgb(color).map((channel) => channel / 255);
            const linear = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
          };
          const contrast = (foreground, background) => {
            const foregroundLuminance = luminance(foreground);
            const backgroundLuminance = luminance(background);
            return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
          };
          const expectedColor = selectedTheme === "dark" ? "rgb(102, 170, 255)" : "rgb(0, 86, 179)";
          const backgroundColor = getComputedStyle(document.body).backgroundColor;
          const populatedNotes = notes.filter((note) => note.textContent.trim());
          return {
            count: populatedNotes.length,
            colorsMatch: populatedNotes.every((note) => getComputedStyle(note).color === expectedColor),
            minimumContrast: Math.min(...populatedNotes.map((note) => contrast(getComputedStyle(note).color, backgroundColor))),
          };
        }, theme);
        expect(highlightResult.count).toBeGreaterThan(0);
        expect(highlightResult.colorsMatch).toBe(true);
        expect(highlightResult.minimumContrast).toBeGreaterThanOrEqual(7);

        const titleWeights = await page
          .locator(".publications .publication-title-text")
          .evaluateAll((titles) => titles.map((title) => getComputedStyle(title).fontWeight));
        expect(titleWeights.every((weight) => Number(weight) >= 700)).toBe(true);

        const previewRatioOffsets = await page.locator(".publications img.preview").evaluateAll((images) =>
          images.map((image) => {
            const bounds = image.getBoundingClientRect();
            return Math.abs(bounds.width / bounds.height - image.naturalWidth / image.naturalHeight);
          })
        );
        expect(previewRatioOffsets.every((offset) => offset <= 0.01)).toBe(true);

        const authorColors = await page
          .locator(".publications .author")
          .first()
          .evaluate((author) => {
            const self = author.querySelector("strong");
            const links = [...author.querySelectorAll("a")];
            return {
              coauthor: getComputedStyle(author).color,
              self: self ? getComputedStyle(self).color : null,
              links: links.map((link) => getComputedStyle(link).color),
            };
          });
        expect(authorColors.self).not.toBe(authorColors.coauthor);
        expect(authorColors.links.every((color) => color === authorColors.coauthor)).toBe(true);
      }

      if (["about", "publications"].includes(route.slug) && testInfo.project.name === "desktop") {
        const publicationLayout = await page.locator(".publications ol.bibliography > li > .row").evaluateAll((rows) =>
          rows.map((row) => {
            const previewColumn = row.querySelector(":scope > .col-sm-4.abbr");
            const detailsColumn = row.querySelector(":scope > .col-sm-8");
            const venueBanner = previewColumn.querySelector(":scope > abbr");
            const preview = previewColumn.querySelector("img.preview, video.preview");
            return {
              columnOffset: Math.abs(previewColumn.getBoundingClientRect().top - detailsColumn.getBoundingClientRect().top),
              widthOffset: venueBanner && preview ? Math.abs(venueBanner.getBoundingClientRect().width - preview.getBoundingClientRect().width) : 0,
            };
          })
        );
        expect(publicationLayout.every(({ columnOffset, widthOffset }) => columnOffset <= 1 && widthOffset <= 1)).toBe(true);
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
