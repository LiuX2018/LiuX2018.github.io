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
      if (route.slug === "software") {
        await page.route(/^https?:\/\//, async (request) => {
          const requestUrl = new URL(request.request().url());
          if (requestUrl.hostname === "127.0.0.1" && requestUrl.port === "4173") return request.continue();
          if (request.request().resourceType() === "stylesheet") {
            return request.fulfill({ contentType: "text/css", body: "" });
          }
          return request.abort("blockedbyclient");
        });
      } else {
        await page.route(/(?:cloudfront\.net|badge\.dimensions\.ai)/, (request) => request.abort());
      }
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
        const cards = page.locator(".repositories .repository-card");
        await expect(cards).toHaveCount(6);
        for (const card of await cards.all()) await expect(card).toBeVisible();
        await expect(page.locator(".repositories .repo img")).toHaveCount(0);
        await expect(cards.first()).toContainText("LiuX2018/On-computational-optics");
        await expect(cards.first()).toContainText("7 stars");
        await expect(cards.first()).toContainText("0 forks");

        const cardLayout = await cards.evaluateAll((elements) =>
          (() => {
            const probe = document.createElement("span");
            probe.style.backgroundColor = "var(--global-card-bg-color)";
            document.body.append(probe);
            const expectedBackground = getComputedStyle(probe).backgroundColor;
            probe.remove();
            return elements.map((card) => ({
              background: getComputedStyle(card).backgroundColor,
              expectedBackground,
              height: card.getBoundingClientRect().height,
            }));
          })()
        );
        expect(cardLayout.every(({ background, expectedBackground }) => background === expectedBackground)).toBe(true);
        expect(cardLayout.every(({ height }) => height >= 195)).toBe(true);
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page).toHaveScreenshot(`${route.slug}-${theme}.png`, {
        caret: "hide",
        fullPage: false,
      });
    });
  }
}
