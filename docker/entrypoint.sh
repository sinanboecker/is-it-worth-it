#!/bin/sh
# Runs as root only to hand /data to PUID:PGID (Unraid: 99:100 = nobody:users), then drops privileges.
set -e

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    chown -R "$PUID:$PGID" "$DATA_DIR"
    exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
fi
exec "$@"
