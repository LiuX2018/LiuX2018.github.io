#!/usr/bin/env bash
set -euo pipefail

readonly CONFIG_FILE="_config.yml"
readonly DOCKER_DESTINATION="/tmp/_site"

ensure_bundle_deps() {
    if ! bundle check; then
        echo "Installing dependencies required by the mounted Gemfile.lock"
        bundle install --jobs 4 --retry 3
    fi
}

echo "Starting al-folio development server"
git config --global --add safe.directory /srv/jekyll 2>/dev/null || true
ensure_bundle_deps
mkdir -p "$DOCKER_DESTINATION"

# Keep Jekyll in the foreground so Docker reports a failed server as a failed
# container instead of leaving an idle container running without port 8080.
exec bundle exec jekyll serve \
    --watch \
    --port=8080 \
    --host=0.0.0.0 \
    --livereload \
    --trace \
    --force_polling \
    --destination "$DOCKER_DESTINATION" \
    --config "$CONFIG_FILE"
