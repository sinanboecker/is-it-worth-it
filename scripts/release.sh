#!/usr/bin/env bash
# Make a release: set the version everywhere, commit, tag and push. GitHub Actions then tests the tag and
# publishes ghcr.io/sinanboecker/is-it-worth-it:<version> and :latest; Unraid updates on its next check.
#   scripts/release.sh 0.2.0
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION=${1:?usage: scripts/release.sh <version>, e.g. 0.2.0}
[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3"; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "release from main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "commit or stash your changes first"; exit 1; }
git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null && { echo "v$VERSION exists already"; exit 1; }

sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" backend/pyproject.toml && rm backend/pyproject.toml.bak  # -i.bak: works with GNU and BSD sed
(cd frontend && npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null)

git add backend/pyproject.toml frontend/package.json frontend/package-lock.json
git diff --cached --quiet || git commit -q -m "Release $VERSION"
git tag -a "v$VERSION" -m "Release $VERSION"
# separate pushes: a tag pushed together with a branch that adds/changes the workflow can be missed by GitHub Actions
git push origin main
git push origin "v$VERSION"
echo "Pushed v$VERSION. Build: https://github.com/sinanboecker/is-it-worth-it/actions"
