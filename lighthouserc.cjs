module.exports = {
  ci: {
    collect: {
      staticDistDir: "./_site",
      url: ["http://localhost/", "http://localhost/news/", "http://localhost/publications/", "http://localhost/repositories/"],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--no-sandbox",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.75, aggregationMethod: "median" }],
        "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median" }],
        "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median" }],
        "categories:seo": ["error", { minScore: 0.95, aggregationMethod: "median" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median" }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 4000, aggregationMethod: "median" }],
      },
    },
  },
};
