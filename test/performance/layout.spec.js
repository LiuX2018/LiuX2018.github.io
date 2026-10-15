const { test, expect } = require("@playwright/test");

for (const route of ["/", "/publications/"]) {
  for (const theme of ["light", "dark"]) {
    test(`${route} ${theme}: previews reserve their space before loading`, async ({ page, baseURL }) => {
      // Isolate image layout from variable third-party badges and icon fonts.
      await page.route(/^https?:\/\//, (request) => {
        if (new URL(request.request().url()).origin === baseURL) return request.continue();
        if (request.request().resourceType() === "stylesheet") return request.fulfill({ contentType: "text/css", body: "" });
        return request.abort("blockedbyclient");
      });
      let releasePreviews;
      const previewsReady = new Promise((resolve) => (releasePreviews = resolve));
      await page.route("**/assets/img/publication_preview/**", async (request) => {
        await previewsReady;
        await request.continue();
      });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("theme", selectedTheme);
      }, theme);

      try {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const previews = page.locator(".publications img.preview");
        expect(await previews.count()).toBeGreaterThan(0);
        const reserved = await previews.evaluateAll((images) =>
          images.map((image) => ({
            loaded: image.naturalWidth > 0,
            width: image.getBoundingClientRect().width,
            height: image.getBoundingClientRect().height,
            ratio: Number(image.getAttribute("width")) / Number(image.getAttribute("height")),
          }))
        );
        expect(reserved.every((image) => !image.loaded && image.height > 0)).toBe(true);
        expect(reserved.every((image) => Math.abs(image.height - image.width / image.ratio) < 1)).toBe(true);
        if (route === "/publications/") await expect(previews.first()).toHaveAttribute("loading", "eager");
        expect(await page.locator('.publications img.preview[loading="lazy"]').count()).toBeGreaterThan(0);

        const titles = page.locator(".publications .title");
        // Isolate preview flow from the theme's navbar adjustment on window.load.
        // Full-page CLS remains covered by the unchanged Lighthouse assertion.
        const relativeTitlePositions = (elements) =>
          elements.map((element) => element.getBoundingClientRect().top - element.closest(".publications").getBoundingClientRect().top);
        const before = await titles.evaluateAll(relativeTitlePositions);
        // Release every offscreen lazy image, too.
        releasePreviews();
        await previews.evaluateAll((images) =>
          Promise.all(
            images.map((image) => {
              image.loading = "eager";
              return image.decode();
            })
          )
        );
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const after = await titles.evaluateAll(relativeTitlePositions);
        expect(after.every((top, index) => Math.abs(top - before[index]) < 1)).toBe(true);

        const loaded = await previews.evaluateAll((images) =>
          images.map((image) => ({
            currentSrc: image.currentSrc,
            source: image.src,
            zoom: image.getAttribute("data-zoom-src"),
            ratioOffset: Math.abs(
              image.getBoundingClientRect().width / image.getBoundingClientRect().height -
                Number(image.getAttribute("width")) / Number(image.getAttribute("height"))
            ),
          }))
        );
        expect(loaded.every((image) => image.ratioOffset < 0.01)).toBe(true);
        expect(loaded.every((image) => new URL(image.zoom, baseURL).href === image.source)).toBe(true);
        expect(
          loaded.every((image) => (image.source.endsWith(".gif") ? image.currentSrc.endsWith(".gif") : image.currentSrc.endsWith(".webp")))
        ).toBe(true);
        await expect(page.locator('link[rel="preload"][href*="xin_recent_photo.png"]')).toHaveCount(0);
      } finally {
        releasePreviews();
        await page.unrouteAll({ behavior: "wait" });
      }
    });
  }
}
