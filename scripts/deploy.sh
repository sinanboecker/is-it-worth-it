#!/usr/bin/env bash
# Fallback for trying an unreleased build on Unraid: build locally and load it over SSH under the same name
# the template uses (ghcr.io/sinanboecker/is-it-worth-it:latest). Normal updates come from release tags instead
# (scripts/release.sh); the next update check on Unraid replaces this build with the latest release again.
#   UNRAID_HOST=root@192.168.178.10 scripts/deploy.sh
# Then recreate the container on Unraid (Docker tab > is-it-worth-it > Edit > Apply): a plain restart
# would keep running the old image. Data in /data stays.
set -euo pipefail

cd "$(dirname "$0")/.."
: "${UNRAID_HOST:?set UNRAID_HOST, e.g. root@192.168.178.10}"
IMAGE=ghcr.io/sinanboecker/is-it-worth-it:latest
ENGINE=${ENGINE:-$(command -v docker >/dev/null && echo docker || echo podman)}

echo "Building $IMAGE with $ENGINE"
build_args=()
[ "$ENGINE" = podman ] && build_args=(--format docker)  # keeps the HEALTHCHECK
"$ENGINE" build "${build_args[@]}" -t "$IMAGE" .

echo "Copying to $UNRAID_HOST"
"$ENGINE" save "$IMAGE" | gzip | ssh "$UNRAID_HOST" "gunzip | docker load"

echo
echo "Loaded $IMAGE. Now recreate the container: Unraid > Docker > is-it-worth-it > Edit > Apply."
