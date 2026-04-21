#!/usr/bin/env bash
set -euo pipefail

# Push the newest local SQLite snapshot to the configured off-host rsync target.

BACKUP_DIR="/var/backups/battleship-arena"
OFFHOST_TARGET="${OFFHOST_TARGET:-OFFHOST_PLACEHOLDER}"

if [[ "$OFFHOST_TARGET" == "OFFHOST_PLACEHOLDER" ]]; then
  echo "OFFHOST_TARGET is not configured" >&2
  exit 1
fi

latest_snapshot="$({ find "$BACKUP_DIR" -maxdepth 1 -type f -exec ls -t {} +; } 2>/dev/null | head -n 1)"

if [[ -z "$latest_snapshot" ]]; then
  exit 0
fi

rsync -av "$latest_snapshot" "$OFFHOST_TARGET"
