#!/usr/bin/env bash
set -euo pipefail

# Restore a production or staging SQLite file from a chosen snapshot path.

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 <prod|staging> <snapshot-path>" >&2
  exit 1
fi

environment="$1"
snapshot_path="$2"

if [[ ! -f "$snapshot_path" ]]; then
  echo "Snapshot not found: $snapshot_path" >&2
  exit 1
fi

case "$environment" in
  prod)
    target_path="/var/lib/battleship-arena/project.db"
    service_name="battleship-arena.service"
    ;;
  staging)
    target_path="/var/lib/battleship-arena-staging/project-staging.db"
    service_name="battleship-arena-staging.service"
    ;;
  *)
    echo "Usage: $0 <prod|staging> <snapshot-path>" >&2
    exit 1
    ;;
esac

tmp_path="${target_path}.restore.$$"
service_was_active=0
restore_complete=0

cleanup() {
  rm -f "$tmp_path"

  if [[ "$restore_complete" -eq 0 && "$service_was_active" -eq 1 ]]; then
    systemctl start "$service_name" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if systemctl is-active --quiet "$service_name"; then
  service_was_active=1
  systemctl stop "$service_name"
fi

install -D -o battleship -g battleship -m 0600 "$snapshot_path" "$tmp_path"
mv -f "$tmp_path" "$target_path"
rm -f "${target_path}-wal" "${target_path}-shm"
restore_complete=1

if [[ "$service_was_active" -eq 1 ]]; then
  systemctl start "$service_name"
fi
