const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const filesUnder = (relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return [];
  return fs
    .readdirSync(absolutePath, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name).slice(absolutePath.length + 1))
    .sort();
};

const failures = [];
const config = read("_config.yml");
const gemfile = read("Gemfile");

const requiredConfig = [
  [/^theme: al_folio_core$/m, "al_folio_core must own the runtime"],
  [/^homepage_title: Xin Liu \(刘鑫\) \| Computational Optics Researcher$/m, "homepage title contract is missing"],
  [/^\s+enabled: false$/m, "disabled v1 feature configuration is missing"],
  [/^search_enabled: false$/m, "global search must remain disabled"],
  [/^enable_math:\s*false\b/m, "MathJax must remain disabled"],
  [/^enable_cookie_consent:\s*false\b/m, "cookie consent must remain disabled"],
  [/^enable_navbar_social:\s*true\b/m, "navbar social links must remain enabled"],
  [
    /github_readme_stats_url: https:\/\/github-readme-stats-git-master-xins-projects-65bbce1e\.vercel\.app/,
    "repository cards must use the existing service",
  ],
];

for (const [pattern, message] of requiredConfig) {
  if (!pattern.test(config)) failures.push(message);
}

if (!/gem 'al_folio_core', '= 1\.0\.15'/.test(gemfile)) {
  failures.push("Gemfile must pin al_folio_core 1.0.15.");
}

const allowedOverrides = {
  _includes: ["header.liquid", "metadata.liquid", "scripts.liquid"],
  _layouts: ["about.liquid", "bib.liquid"],
  _sass: ["_custom.scss"],
  "assets/css": ["main.scss"],
};

for (const [directory, expectedFiles] of Object.entries(allowedOverrides)) {
  const actualFiles = filesUnder(directory);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    failures.push(`${directory} contains unexpected runtime files: ${actualFiles.join(", ") || "none"}.`);
  }
}

for (const forbiddenPath of [
  "_plugins",
  "_posts",
  "_projects",
  "assets/audio",
  "assets/fonts",
  "assets/html",
  "assets/jupyter",
  "assets/js",
  "assets/plotly",
  "assets/video",
  "assets/webfonts",
  "readme_preview",
]) {
  if (exists(forbiddenPath)) failures.push(`Removed template/runtime path returned: ${forbiddenPath}.`);
}

for (const requiredPath of [
  ".al-folio-overrides.yml",
  "test/visual/playwright.config.js",
  "test/visual/site.spec.js",
  "scripts/check_publication_previews.rb",
  "scripts/validate_built_site.rb",
]) {
  if (!exists(requiredPath)) failures.push(`Required migration contract is missing: ${requiredPath}.`);
}

const header = read("_includes/header.liquid");
if (!header.includes("/assets/pdf/CV_Xin_Liu.pdf")) failures.push("Header must link directly to the CV PDF.");
if (header.includes("'/cv/'") || header.includes('"/cv/"')) failures.push("Header must not restore a /cv/ route.");

const scripts = read("_includes/scripts.liquid");
for (const badge of ["altmetric", "dimensions"]) {
  if (!scripts.includes(`page.publication_badges and site.enable_publication_badges.${badge}`)) {
    failures.push(`${badge} script must be scoped to pages that enable publication badges.`);
  }
}

const dependencyState = `${read("Gemfile.lock")}\n${read("package-lock.json")}`;
const vulnerableSwiper = dependencyState.match(/swiper[^\n]*\b(10|11)\./i);
if (vulnerableSwiper) failures.push(`Vulnerable Swiper dependency detected: ${vulnerableSwiper[0]}.`);

if (failures.length) {
  console.error("Project style contract failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Project style contract passed.");
