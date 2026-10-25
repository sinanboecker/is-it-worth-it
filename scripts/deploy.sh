#!/usr/bin/env bash
# Build the image locally and load it into Docker on Unraid over SSH (no registry).
#   UNRAID_HOST=root@192.168.178.10 scripts/deploy.sh
# Then recreate the container on Unraid (Docker tab > is-it-worth-it > Edit > Apply): a plain restart
# would keep running the old image. Migrations run on start; data in /data stays.
set -euo pipefail

cd "$(dirname "$0")/.."
: "${UNRAID_HOST:?set UNRAID_HOST, e.g. root@192.168.178.10}"
IMAGE=is-it-worth-it
VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' backend/pyproject.toml)
ENGINE=${ENGINE:-$(command -v docker >/dev/null && echo docker || echo podman)}

echo "Building $IMAGE:$VERSION with $ENGINE"
build_args=()
[ "$ENGINE" = podman ] && build_args=(--format docker)  # keeps the HEALTHCHECK
"$ENGINE" build "${build_args[@]}" -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .

echo "Copying to $UNRAID_HOST"
save_args=()
[ "$ENGINE" = podman ] && save_args=(--multi-image-archive)
# podman names local images localhost/<name>; retag so the Unraid template finds is-it-worth-it:latest
"$ENGINE" save "${save_args[@]}" "$IMAGE:$VERSION" "$IMAGE:latest" | gzip | ssh "$UNRAID_HOST" "
    set -e
    gunzip | docker load
    for tag in $VERSION latest; do
        if docker image inspect localhost/$IMAGE:\$tag >/dev/null 2>&1; then
            docker tag localhost/$IMAGE:\$tag $IMAGE:\$tag && docker rmi localhost/$IMAGE:\$tag >/dev/null
        fi
    done
    docker image ls $IMAGE"

echo
echo "Loaded $IMAGE:$VERSION (= latest). Now recreate the container: Unraid > Docker > $IMAGE > Edit > Apply."
echo "Rollback: ssh $UNRAID_HOST docker tag $IMAGE:<old version> $IMAGE:latest, then Edit > Apply again."
