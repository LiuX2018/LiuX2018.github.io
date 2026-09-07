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
        await page.route(/(?:cloudfront\.net|badge\.dimensions\.ai|github\.githubassets\.com)/, (request) => request.abort());
      }
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: ".emoji { visibility: hidden !important; }" });
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

        const intros = page.locator(".publications .publication-intro");
        await expect(intros).toHaveCount(route.slug === "about" ? await page.locator(".publications ol.bibliography > li").count() : 0);
        if (route.slug === "about") {
          await expect(intros.first()).toBeVisible();
          expect((await intros.allTextContents()).every((intro) => intro.trim().length > 0)).toBe(true);
        }
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
            probe.style.backgroundColor = "var(--repository-card-bg-color)";
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
        if (testInfo.project.name === "desktop") {
          expect(cardLayout.every(({ height }) => height >= 175)).toBe(true);
        }
      }

      if (["about", "publications"].includes(route.slug)) {
        const mobile = page.viewportSize().width < 768;
        const buttons = await page.locator(".publications .links a.btn").evaluateAll((links) =>
          links.map((link) => ({
            height: link.getBoundingClientRect().height,
            width: link.getBoundingClientRect().width,
            fontSize: getComputedStyle(link).fontSize,
          }))
        );
        expect(buttons.every((button) => button.height >= (mobile ? 44 : 28))).toBe(true);
        expect(buttons.every((button) => button.fontSize === (mobile ? "14px" : "13px"))).toBe(true);
        if (mobile) expect(buttons.every((button) => button.width >= 44)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page
          .locator(".publications ol.bibliography > li")
          .first()
          .evaluate((row) => {
            window.scrollTo(0, row.getBoundingClientRect().top + window.scrollY - 80);
          });
        await expect(page).toHaveScreenshot(route.slug + "-papers-" + theme + ".png", { caret: "hide", fullPage: false });
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page).toHaveScreenshot(`${route.slug}-${theme}.png`, {
        caret: "hide",
        fullPage: false,
      });
    });
  }
}

for (const route of routes.filter((route) => ["about", "publications"].includes(route.slug))) {
  for (const theme of ["light", "dark"]) {
    test(route.slug + " responsive " + theme, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "This test sets each viewport explicitly.");
      await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
      await page.route(/(?:cloudfront\.net|badge\.dimensions\.ai|github\.githubassets\.com)/, (request) => request.abort());
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      for (const width of [1440, 390, 320, 767, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        const mobile = width < 768;
        const metrics = await page.locator(".publications ol.bibliography > li").evaluateAll((rows) =>
          rows.map((row) => {
            const links = row.querySelector(".links");
            const intro = row.querySelector(".publication-intro");
            const linkBounds = links.getBoundingClientRect();
            return {
              lastInGroup: row.matches(":last-child"),
              margin: getComputedStyle(row).marginBottom,
              padding: getComputedStyle(row).paddingBottom,
              gap: getComputedStyle(links).gap,
              wrap: getComputedStyle(links).flexWrap,
              introClipped: intro ? intro.scrollWidth > intro.clientWidth || intro.scrollHeight > intro.clientHeight + 1 : false,
              buttons: [...links.querySelectorAll("a.btn")].map((button) => {
                const bounds = button.getBoundingClientRect();
                return {
                  height: bounds.height,
                  width: bounds.width,
                  font: getComputedStyle(button).fontSize,
                  contained: bounds.left >= linkBounds.left - 1 && bounds.right <= linkBounds.right + 1,
                };
              }),
            };
          })
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(metrics.every((row) => row.gap === "8px" && row.wrap === "wrap" && !row.introClipped)).toBe(true);
        expect(metrics.filter((row) => !row.lastInGroup).every((row) => row.margin === "24px" && row.padding === "24px")).toBe(true);
        expect(
          metrics
            .flatMap((row) => row.buttons)
            .every(
              (button) =>
                button.contained &&
                button.height >= (mobile ? 44 : 28) &&
                button.font === (mobile ? "14px" : "13px") &&
                (!mobile || button.width >= 44)
            )
        ).toBe(true);
        const buttons = page.locator(".publications .links a.btn");
        await buttons.first().focus();
        await page.keyboard.press("Tab");
        await expect(buttons.nth(1)).toBeFocused();
        const focus = await buttons.nth(1).evaluate((button) => ({
          visible: button.matches(":focus-visible"),
          width: getComputedStyle(button).outlineWidth,
          style: getComputedStyle(button).outlineStyle,
        }));
        expect(focus).toEqual({ visible: true, width: "2px", style: "solid" });
      }
    });
  }
}
