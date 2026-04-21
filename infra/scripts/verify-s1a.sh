#!/usr/bin/env bash
set -euo pipefail

# Run the full S1a local verification contract from a fresh clone or CI workspace.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERIFY_DB="$REPO_ROOT/dev-verify.db"
VERIFY_LOG="$REPO_ROOT/dev-verify.log"
VERIFY_PORT="18081"

cd "$REPO_ROOT"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  rm -f "$VERIFY_DB" "$VERIFY_DB-wal" "$VERIFY_DB-shm" "$VERIFY_LOG"
}

trap cleanup EXIT

echo "[verify-s1a] install"
bun install --frozen-lockfile

echo "[verify-s1a] lint"
bun run lint

echo "[verify-s1a] format"
bun run fmt:check

echo "[verify-s1a] typecheck"
bun run typecheck

echo "[verify-s1a] test"
DATABASE_PATH=:memory: bun test

echo "[verify-s1a] build"
bun run build

echo "[verify-s1a] health"
DATABASE_PATH="$VERIFY_DB" PORT="$VERIFY_PORT" COMMIT_SHA=verify VERSION=0.1.0-verify \
  bun ./backend/dist/index.js >"$VERIFY_LOG" 2>&1 &
BACKEND_PID="$!"

for attempt in $(seq 1 30); do
  if body="$(curl --silent --show-error --fail "http://127.0.0.1:${VERIFY_PORT}/api/health" 2>/dev/null)"; then
    if grep -q '"status":"ok"' <<<"$body"; then
      break
    fi
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo "[verify-s1a] backend health check failed" >&2
    cat "$VERIFY_LOG" >&2 || true
    exit 1
  fi

  sleep 1
done

kill "$BACKEND_PID"
wait "$BACKEND_PID" >/dev/null 2>&1 || true
unset BACKEND_PID
rm -f "$VERIFY_DB" "$VERIFY_DB-wal" "$VERIFY_DB-shm"

echo "[verify-s1a] web build"
bun run build:web

[[ -f "$REPO_ROOT/web/dist/sw.js" ]]
[[ -f "$REPO_ROOT/web/dist/index.html" ]]
[[ -f "$REPO_ROOT/web/dist/manifest.webmanifest" ]]

echo "S1a verification passed"
