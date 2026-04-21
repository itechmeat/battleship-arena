# S1a Bootstrap - Task Checklist

This is a progress tracker. Exact file contents, commands, and verification steps live in `docs/superpowers/plans/2026-04-20-s1a-bootstrap.md`. Each task below corresponds 1:1 to a numbered task in that plan; when a task is ticked here, the matching plan task is done.

**Conventions:**

- One commit per task (AGENTS.md requires explicit user permission for each commit).
- Each task's test suite and verify script pass before the next task starts.
- No task executes anything on a live host. All infra files ship to the repo and are applied only in the S1b change.

## 0. Pre-task - Version verification

- [x] 0.1 Create `docs/ops/version-log-2026-04-20.md` and fill the Resolved column for every pinned dependency against its source of truth (npm registry for JS/TS libraries, GitHub Releases for Bun, Caddy website for Caddy). Every resolved version is `>= floor` from `docs/spec.md`.

## 1. Root workspace and tooling

- [x] 1.1 Create root config files (`.bun-version`, `.editorconfig`, `.gitignore`, `bunfig.toml` without the `[test]` preload, `tsconfig.base.json` with `allowImportingTsExtensions` and `noEmit`, `.oxfmtrc.json`, extend `oxlint.json`).
- [x] 1.2 Create root `package.json` with Bun workspaces, `packageManager` and scripts, and `lefthook.yml` for parallel pre-commit hooks.
- [x] 1.3 Run `bun install` and `bunx lefthook install`; stage root config + lockfile + version log; commit.

## 2. shared/ package - non-validator modules

- [x] 2.1 Create `shared/package.json` and `shared/tsconfig.json` (no `rootDir`).
- [x] 2.2 Create `shared/src/constants.ts`, `outcome.ts`, `error-codes.ts`, `types.ts` per the requirements in `specs/shared-contract/spec.md`.
- [x] 2.3 Create `shared/src/index.ts` without the `shot-schema` re-export (added in Task 3); confirm `bun --filter shared run typecheck` passes.

## 3. shared/ package - shot-schema validator (TDD)

- [x] 3.1 Write `shared/tests/shot-schema.test.ts` covering valid shots, schema-error variants (non-JSON, missing key, wrong types), and invalid-coordinate variants (out-of-range).
- [x] 3.2 Implement `shared/src/shot-schema.ts` as a pure function returning the `ok | schema_error | invalid_coordinate` discriminated union.
- [x] 3.3 Update `shared/src/index.ts` to re-export `./shot-schema.ts`; run `bun test shared/` and `bun --filter shared run typecheck`; commit shared/.

## 4. backend/ package - scaffold + config + errors

- [x] 4.1 Create `backend/package.json` (Hono, drizzle-orm, `@types/bun`, drizzle-kit) and `backend/tsconfig.json` (no `rootDir`, no `types: ["bun-types"]` - `@types/bun` auto-loads).
- [x] 4.2 Implement `backend/src/config.ts` with `loadConfig(env)` plus tests covering required/optional env values and invalid-input rejection.
- [x] 4.3 Implement `backend/src/errors.ts` with `respondError(c, code, status, message, detail?)` returning the closed-set envelope.
- [x] 4.4 Run `bun test backend/` and commit.

## 5. backend/ - DATABASE_PATH test guard

- [x] 5.1 Create `backend/tests/setup.ts` that requires `DATABASE_PATH` to be set and aborts the suite if the value is not `:memory:`, does not start with `/tmp/`, and does not contain `-test-` (unset is treated as unsafe).
- [x] 5.2 Create `backend/tests/fixtures/guard-probe.ts` and `backend/tests/db-guard.test.ts` that spawn a sub-process to exercise the guard for accept and reject cases.
- [x] 5.3 Update `bunfig.toml` to add the `[test] preload = ["./backend/tests/setup.ts"]` entry now that the file exists; run the tests; commit.

## 6. backend/ - health route and app factory

- [x] 6.1 Write `backend/tests/health.test.ts` exercising `GET /api/health` (200 + shape) and 404 envelope via `app.request`.
- [x] 6.2 Implement `backend/src/api/health.ts` and `backend/src/app.ts` (Hono factory with error envelope middleware and 404 handler); run the tests and typecheck; commit.

## 7. backend/ - Drizzle schema and first migration

- [x] 7.1 Create `backend/src/db/schema.ts` with the full `runs` and `run_shots` column set from `docs/spec.md` section 5.1, composite primary key on `run_shots`, FK to `runs` with cascade.
- [x] 7.2 Create `backend/drizzle.config.ts` and run `bun --filter backend run drizzle:generate --name init` to produce `backend/src/db/migrations/0000_init.sql` and the meta journal.
- [x] 7.3 Commit schema, config, and generated migration.

## 8. backend/ - migrator with tests

- [x] 8.1 Create `backend/src/db/ulid.ts` (ULID-like id generator used by tests and runtime).
- [x] 8.2 Write `backend/tests/migrator.test.ts` (fresh DB creates tables; idempotent on second call).
- [x] 8.3 Implement `backend/src/db/migrator.ts` using Drizzle's `bun-sqlite/migrator`; run the test; commit.

## 9. backend/ - DB client and withTempDatabase

- [x] 9.1 Implement `backend/src/db/client.ts` exposing `openDatabase(path)` - the only runtime primitive that calls `new Database(...)`; enables WAL and FK pragmas and applies migrations.
- [x] 9.2 Write `backend/tests/client.test.ts` (openDatabase applies migrations and enables FK pragma).
- [x] 9.3 Implement `backend/src/db/with-temp-database.ts` as a test-only helper that delegates to `openDatabase(path)` with a `/tmp/bsa-test-<ulid>.db` path.
- [x] 9.4 Write `backend/tests/with-temp-database.test.ts` (live DB during callback; file unlinked after, including on throw; schema applied before callback).
- [x] 9.5 Run both suites; commit.

## 10. backend/ - bootstrap() and startup-order test

- [x] 10.1 Implement `backend/src/index.ts` exporting `bootstrap(config)` that wires `openDatabase` + `createApp` + `Bun.serve` and returns `{ server, sqlite, config }`; keep the script entrypoint gated on `import.meta.main`.
- [x] 10.2 Write `backend/tests/bootstrap.test.ts` that calls `bootstrap()` against a `/tmp/bsa-test-*` path, issues an actual `fetch` against the server's port for `/api/health`, asserts the DB has the migrated tables, and rejects a bootstrap with an unreachable path.
- [x] 10.3 Run `bun --filter backend test`; smoke-run `bun --filter backend run dev` locally and `curl /api/health`; commit.

## 11. web/ - package scaffold

- [x] 11.1 Create `web/package.json`, `web/tsconfig.json`, `web/astro.config.mjs` with the Solid integration.
- [x] 11.2 Add empty `web/src/islands/.gitkeep` and `web/src/styles/.gitkeep`.
- [x] 11.3 Run `bun install`; commit web scaffold + lockfile.

## 12. web/ - PWA manifest, icons, shell page

- [x] 12.1 Create `web/public/manifest.webmanifest` with three icon entries and the required PWA fields.
- [x] 12.2 Create `web/public/icons/source.svg` and generate three PNGs (192, 512, maskable-512) via `@resvg/resvg-js-cli`.
- [x] 12.3 Create `web/src/pages/index.astro` shell with the inline SW registration script (production-only).
- [x] 12.4 Write `web/tests/manifest.test.ts` and run `bun test web/`; build via `bun --filter web run build`; commit.

## 13. web/ - hand-rolled service worker

- [x] 13.1 Create `web/src/pwa/sw.ts` with install/activate/fetch handlers, a `__SHELL_MANIFEST__` define placeholder, and the strict "skip `/api/*` and non-GET" rule.
- [x] 13.2 Create `web/scripts/build-sw.ts` that walks `web/dist/`, builds the shell URL list, and compiles `sw.ts` via `Bun.build` with the manifest inlined.
- [x] 13.3 Wire the post-build step into `web/package.json` so `astro build && bun run ./scripts/build-sw.ts` is one pipeline; rebuild and confirm `web/dist/sw.js` contains the inlined manifest; commit.

## 14. infra/ - Caddyfile

- [x] 14.1 Create `infra/Caddyfile` with two vhosts, the `maintenance_gate` snippet importing `/var/www/battleship-arena/maintenance.html`, `flush_interval -1` on `/api/*`, 10-minute read/write timeouts, and immutable cache headers on fingerprinted assets. Commit.

## 15. infra/ - systemd units

- [x] 15.1 Create the six systemd unit files (`battleship-arena.service`, `battleship-arena-staging.service`, `battleship-backup.service` + `.timer`, `battleship-offhost-rsync.service` + `.timer`) with the hardening directives from the plan. Commit.

## 16. infra/ - ops scripts and maintenance page

- [x] 16.1 Create `infra/scripts/backup.sh`, `offhost-rsync.sh`, `maintenance-on.sh`, `maintenance-off.sh`, `restore.sh`.
- [x] 16.2 Create `infra/scripts/host-bootstrap.sh` that creates `battleship` and `battleship-deploy` users, installs directories with setgid group ownership, installs `maintenance.html` to `/var/www/battleship-arena/maintenance.html`, and installs + enables all systemd units.
- [x] 16.3 Create `infra/scripts/verify-s1a.sh` and `infra/maintenance.html`.
- [x] 16.4 `chmod +x infra/scripts/*.sh`; run `bash infra/scripts/verify-s1a.sh` locally and confirm `S1a verification passed`; commit.

## 17. CI - pr.yml

- [x] 17.1 Create `.github/workflows/pr.yml` with one job running install (`--frozen-lockfile`), lint, fmt:check, typecheck, test (DATABASE_PATH=:memory:), build, and `bash infra/scripts/verify-s1a.sh`; commit.

## 18. CI - deploy-staging.yml

- [x] 18.1 Create `.github/workflows/deploy-staging.yml` with a `build` job and a `deploy` job. The `deploy` job runs unconditionally, has a first `gate` step writing `### Deploy gate: ENABLED|DISABLED` to `$GITHUB_STEP_SUMMARY`, and guards every subsequent step on `steps.gate.outputs.enabled == 'true'`. Use `STAGING_SSH_HOST` for rsync paths and `STAGING_PUBLIC_URL` for the health check; concurrency group `deploy-staging` with `cancel-in-progress: false`. Commit.

## 19. CI - Dependabot

- [x] 19.1 Create `.github/dependabot.yml` with grouped weekly updates for `github-actions` and `npm`; commit.

## 20. S1b handover runbook

- [x] 20.1 Create `docs/ops/host-bootstrap.md` with the decisions S1b must record, the path and user models on the host, the secrets/variables inventory (including `STAGING_PUBLIC_URL`), and the ordered bootstrap steps through the reboot drill; commit.

## 21. Final verification and PR

- [x] 21.1 Clean local workspace (`rm -rf node_modules web/dist backend/dist .astro`) and run `bash infra/scripts/verify-s1a.sh`; confirm it prints `S1a verification passed`.
- [ ] 21.2 Confirm `vars.STAGING_DEPLOY_ENABLED` is unset or not `"true"` in the GitHub repo.
- [ ] 21.3 Push the branch, open the PR, watch `pr.yml` go green, and confirm on merge that `deploy-staging.yml` runs `build` green and the `deploy` job emits `### Deploy gate: DISABLED` in its step summary while skipping the actual deploy steps.
- [ ] 21.4 Tick the S1a checklist items under `docs/plan.md` section 3; commit that doc update separately.
