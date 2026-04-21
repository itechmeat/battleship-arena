#!/usr/bin/env bash
set -euo pipefail

# Create hourly SQLite snapshots for every present environment database and prune retention.

BACKUP_DIR="/var/backups/battleship-arena"
HOURLY_KEEP="${HOURLY_KEEP:-48}"
DAILY_KEEP="${DAILY_KEEP:-30}"

prune_snapshots() {
  local label="$1"
  local cadence="$2"
  local keep_count="$3"
  mapfile -t snapshots < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${label}-${cadence}-*.sqlite" | sort -r)

  if (( ${#snapshots[@]} <= keep_count )); then
    return 0
  fi

  for snapshot in "${snapshots[@]:keep_count}"; do
    rm -f "$snapshot"
  done
}

snapshot_database() {
  local label="$1"
  local database_path="$2"

  if [[ ! -f "$database_path" ]]; then
    return 0
  fi

  install -d -m 0750 "$BACKUP_DIR"

  local timestamp hour
  read -r timestamp hour < <(date -u +"%Y%m%dT%H%M%SZ %H")
  local hourly_snapshot="$BACKUP_DIR/${label}-hourly-${timestamp}.sqlite"

  sqlite3 "$database_path" "VACUUM INTO '$hourly_snapshot';"
  chmod 600 "$hourly_snapshot"

  if [[ "$hour" == "00" ]]; then
    local daily_snapshot="$BACKUP_DIR/${label}-daily-${timestamp}.sqlite"
    cp "$hourly_snapshot" "$daily_snapshot"
    chmod 600 "$daily_snapshot"
  fi

  prune_snapshots "$label" "hourly" "$HOURLY_KEEP"
  prune_snapshots "$label" "daily" "$DAILY_KEEP"
}

snapshot_database "prod" "/var/lib/battleship-arena/project.db"
snapshot_database "staging" "/var/lib/battleship-arena-staging/project-staging.db"
