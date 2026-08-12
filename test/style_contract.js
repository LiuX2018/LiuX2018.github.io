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
const aboutPage = read("_pages/about.md");
const repositoriesPage = read("_pages/repositories.md");
const customStyles = read("_sass/_custom.scss");
const dockerfile = read("Dockerfile");
const dockerCompose = read("docker-compose.yml");
const dockerEntrypoint = read("bin/entry_point.sh");
const deployWorkflow = read(".github/workflows/deploy.yml");
const repositoryRefresh = read("scripts/refresh_repositories.rb");

const requiredConfig = [
  [/^theme: al_folio_core$/m, "al_folio_core must own the runtime"],
  [/^homepage_title: Xin Liu \(刘鑫\) \| Computational Optics Researcher$/m, "homepage title contract is missing"],
  [/^\s+enabled: false$/m, "disabled v1 feature configuration is missing"],
  [/^search_enabled: false$/m, "global search must remain disabled"],
  [/^enable_math:\s*false\b/m, "MathJax must remain disabled"],
  [/^enable_cookie_consent:\s*false\b/m, "cookie consent must remain disabled"],
  [/^enable_navbar_social:\s*true\b/m, "navbar social links must remain enabled"],
];

for (const [pattern, message] of requiredConfig) {
  if (!pattern.test(config)) failures.push(message);
}

if (!/gem 'al_folio_core', '= 1\.0\.15'/.test(gemfile)) {
  failures.push("Gemfile must pin al_folio_core 1.0.15.");
}

if (!/^publication_badges: true$/m.test(aboutPage)) {
  failures.push("Selected publications must enable their citation badge runtime.");
}
if (!/\.publication-legend \{[\s\S]*color: var\(--global-text-color\);/.test(customStyles)) {
  failures.push("The selected-publication contribution legend must use the primary text color.");
}
if (!/\.abbr \.preview \{[\s\S]*height: auto;[\s\S]*max-width: none;[\s\S]*width: 100%;/.test(customStyles)) {
  failures.push("Publication previews must remain banner-width without changing their intrinsic aspect ratios.");
}
if (!/\.author \{[\s\S]*color: var\(--global-text-color-light\);/.test(customStyles)) {
  failures.push("Coauthor names must use the muted theme text color.");
}
if (!/\.author strong \{[\s\S]*color: var\(--global-text-color\);/.test(customStyles)) {
  failures.push("Xin Liu's author name must retain the primary theme text color.");
}
if (!/\.publication-title-text \{[\s\S]*font-weight: 700;/.test(customStyles)) {
  failures.push("Publication titles must use an explicit bold weight.");
}
if (!/:root \{[\s\S]*--publication-highlight-color: #0056b3;/.test(customStyles)) {
  failures.push("Light-mode publication highlights must retain the accessible legacy blue.");
}
if (!/html\[data-theme="dark"\] \{[\s\S]*--publication-highlight-color: #66aaff;/.test(customStyles)) {
  failures.push("Dark-mode publication highlights must use the accessible adaptive blue.");
}
if (!/\.publication-note:not\(:empty\) \{[\s\S]*color: var\(--publication-highlight-color\);/.test(customStyles)) {
  failures.push("Publication notes must use the dedicated adaptive highlight color.");
}
if (/\.periodical \+ \.periodical:not\(:empty\)/.test(customStyles)) {
  failures.push("Publication note styling must not target unrelated adjacent periodical fields.");
}
if (!repositoriesPage.includes('class="repository-card"') || !repositoriesPage.includes('class="repository-description"')) {
  failures.push("The Software page must render repository metadata as local HTML cards.");
}
if (repositoriesPage.includes("repository/repo.liquid") || /<img\b/.test(repositoriesPage)) {
  failures.push("The Software page must not restore image-based repository cards.");
}
if (
  !/:root \{[\s\S]*--repository-card-bg-color: #ffffff;[\s\S]*--repository-card-border-color: rgba\(0, 0, 0, 0\.1\);[\s\S]*\}/.test(customStyles) ||
  !/html\[data-theme="dark"\] \{[\s\S]*--repository-card-bg-color: #212529;[\s\S]*--repository-card-border-color: #424246;[\s\S]*\}/.test(
    customStyles
  ) ||
  !/\.repositories \.repository-card \{[\s\S]*background-color: var\(--repository-card-bg-color\);[\s\S]*border: 1px solid var\(--repository-card-border-color\);/.test(
    customStyles
  )
) {
  failures.push("Repository cards must use explicit light and dark card and divider colors.");
}
if (!/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.repositories \.repository-card/.test(customStyles)) {
  failures.push("Repository card motion must respect reduced-motion preferences.");
}
const retiredCardService = "github-readme-stats";
if ([config, repositoriesPage, customStyles].some((contents) => contents.includes(retiredCardService))) {
  failures.push("The retired external GitHub card service must not be referenced by the site runtime.");
}

if (!/schedule:\s*\n\s*- cron: "17 3 \* \* \*"/.test(deployWorkflow)) {
  failures.push("The deploy workflow must refresh and publish repository snapshots daily at 03:17 UTC.");
}
if (!deployWorkflow.includes("bundle exec ruby scripts/refresh_repositories.rb")) {
  failures.push("The deploy workflow must refresh GitHub repository snapshots before building.");
}
if (!deployWorkflow.includes("npx prettier --write _data/repositories.yml")) {
  failures.push("The deploy workflow must format refreshed repository snapshots before linting.");
}
if (!deployWorkflow.includes("if: github.event_name != 'pull_request'")) {
  failures.push("Pull requests must remain build-only while push, schedule, and manual runs can deploy.");
}
for (const contract of ["GITHUB_TOKEN", "Tempfile", "File.rename", "checked-in snapshots"]) {
  if (!repositoryRefresh.includes(contract)) failures.push(`Repository refresh is missing its ${contract} contract.`);
}

if (!/^FROM ruby:3\.3\.5-slim$/m.test(dockerfile)) {
  failures.push("Docker must pin Ruby 3.3.5 instead of using a floating image tag.");
}
if (!dockerfile.includes("gem install --no-document bundler -v 4.0.6")) {
  failures.push("Docker must install the Bundler version recorded in Gemfile.lock.");
}
if (!dockerCompose.includes("image: liux2018-github-io:al-folio-v1.2")) {
  failures.push("Compose must use the project image instead of tagging it as upstream latest.");
}
if (!dockerCompose.includes("healthcheck:")) {
  failures.push("Compose must expose Jekyll readiness through a healthcheck.");
}
if (!dockerEntrypoint.includes("exec bundle exec jekyll serve")) {
  failures.push("The Docker entrypoint must keep Jekyll in the foreground.");
}
if (dockerEntrypoint.includes("git restore Gemfile.lock")) {
  failures.push("The Docker entrypoint must not overwrite the mounted Gemfile.lock.");
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
  "scripts/refresh_repositories.rb",
  "scripts/validate_built_site.rb",
  "test/refresh_repositories_test.rb",
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

const bibliographyLayout = read("_layouts/bib.liquid");
const aboutLayout = read("_layouts/about.liquid");
if (!aboutLayout.includes('class="publication-legend" style="color: var(--global-text-color)"')) {
  failures.push("The selected-publication legend must carry its primary text color through cached development CSS.");
}
if (!bibliographyLayout.includes('class="col col-sm-4 abbr"') || !bibliographyLayout.includes("col-sm-8{% else %}col-sm-10")) {
  failures.push("Publication details must use the supported 4 + 8 responsive grid.");
}
if (!bibliographyLayout.includes('<strong class="publication-title-text">{{ entry.title }}</strong>')) {
  failures.push("Publication titles must retain explicit strong emphasis.");
}
if (bibliographyLayout.includes("col-sm-7")) {
  failures.push("Unsupported col-sm-7 must not return to the Tailwind publication layout.");
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
