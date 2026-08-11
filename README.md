# Xin Liu’s academic website

Source for [liux2018.github.io](https://liux2018.github.io), built with Jekyll and the `al_folio_core` v1 runtime from the stable al-folio v1.2 template.

The published contract is intentionally small: `/`, `/news/`, `/publications/`, and `/repositories/`. The navigation’s CV item links directly to `assets/pdf/CV_Xin_Liu.pdf`; there is no `/cv/` page.

## Local development

```sh
docker compose up --build
```

Open <http://localhost:8080>. The container mounts the repository and serves Jekyll with live reload.

## Production build and validation

```sh
docker compose run --rm -e JEKYLL_ENV=production jekyll bundle exec jekyll build
docker compose run --rm jekyll ruby scripts/check_publication_previews.rb
docker compose run --rm jekyll ruby scripts/validate_built_site.rb
docker compose run --rm jekyll ruby scripts/check_internal_links.rb
npm ci
npm run lint:prettier
npm run lint:style-contract
```

Run Lighthouse against the production build with `npx lhci autorun`, and run the Playwright visual checks with `npm run test:visual`.

## Upgrade audits

Before changing al-folio versions, run:

```sh
docker compose run --rm jekyll bundle exec al-folio upgrade audit
docker compose run --rm jekyll bundle exec al-folio upgrade overrides audit
```

Local theme overrides are limited to the files recorded in `.al-folio-overrides.yml`. Rebuild each override from the target `al_folio_core` version, then re-run both audits; do not copy an older runtime wholesale.

The `upstream` remote points to `https://github.com/alshedivat/al-folio.git`. Upgrade from stable tags rather than merging upstream history into this content repository.
