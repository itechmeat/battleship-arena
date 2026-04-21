## Why

The repository has a complete product spec, architecture, and four-story development plan but no application code and no CI pipeline. Story S1 - Bootstrap - is the foundation every later story depends on: without a green pipeline, a runnable backend, a PWA shell, a database schema with applied migrations, and a deploy-ready infrastructure configuration, S2 cannot even begin. The brainstorm captured in `docs/superpowers/specs/2026-04-20-s1-bootstrap-design.md` split S1 into S1a (code + CI + local verification, no live host) and S1b (VPS provisioning + first deploy + reboot drill). This change lands S1a. S1b is tracked as a separate change to be opened once a host is provisioned; all infra files committed here are prepared for S1b but not executed.

## What Changes

- **Monorepo and toolchain**. Bun workspaces wire `shared`, `backend`, `web`. Root config for TypeScript (strict + `allowImportingTsExtensions`), oxlint, oxfmt, `.bun-version`, `packageManager`, `lefthook` pre-commit hooks, Dependabot for GitHub Actions and npm.
- **Shared contract package**. `shared/` exposes outcome enum, error-code enum, hand-rolled shot-schema validator (returning discriminated `ok | schema_error | invalid_coordinate`), board constants, and the API response type for `/api/health`.
- **Backend service**. Hono app on Bun with `/api/health` returning `{ status, version, commitSha, startedAt }`; closed-set error envelope; Drizzle schema for `runs` and `run_shots` with the final columns from `docs/spec.md` section 5.1; startup applies pending migrations inside a transaction before the HTTP listener binds; `openDatabase` is the only runtime primitive that calls `new Database(...)`; `withTempDatabase` test helper delegates to it; `bootstrap(config)` exported from `index.ts` and covered by a test that proves migrations complete before `/api/health` is reachable; `DATABASE_PATH` test guard requires the variable to be set and rejects any value that is not `:memory:`, does not start with `/tmp/`, and does not contain `-test-` (unset is treated as unsafe).
- **Web PWA shell**. Astro static site with Solid integration installed (no islands yet), manifest with three icons, a hand-rolled service worker compiled from `web/src/pwa/sw.ts` with an inlined shell-manifest and strict "never cache `/api/*`" matcher, shell page at `/` that registers the service worker only in production.
- **Infrastructure files committed, not executed**. `Caddyfile` with prod + staging vhosts and the hard-maintenance matcher; six systemd unit files (backend × 2 envs, hourly backup + timer, daily off-host rsync + timer); five ops scripts (`backup.sh`, `offhost-rsync.sh`, `maintenance-on.sh`, `maintenance-off.sh`, `restore.sh`); `host-bootstrap.sh` (one-shot host provisioning, creates the `battleship` runtime user, the `battleship-deploy` CI user, the rsync targets with setgid group ownership, and installs `maintenance.html`); `verify-s1a.sh` (the local-and-CI S1a definition-of-done script); `maintenance.html`.
- **CI pipelines**. `pr.yml` runs install, lint, fmt check, typecheck, tests (under `DATABASE_PATH=:memory:`), build, and `verify-s1a.sh` on every PR. `deploy-staging.yml` triggers on push to `main`; the `build` job always runs; the `deploy` job runs unconditionally but its first step writes `### Deploy gate: ENABLED|DISABLED` to `$GITHUB_STEP_SUMMARY` based on `vars.STAGING_DEPLOY_ENABLED` and every subsequent step is gated on that output. Uses `vars.STAGING_SSH_HOST` for rsync and a separate `vars.STAGING_PUBLIC_URL` for the TLS health check. Dependabot configuration for weekly grouped updates.
- **S1b handover runbook**. `docs/ops/host-bootstrap.md` enumerates the irreversible operator decisions, the path model on the host, the user model (`battleship`, `battleship-deploy`, `www-data`), and the ordered bootstrap steps including the narrow sudoers entry for the deploy user.
- **Version log**. `docs/ops/version-log-2026-04-20.md` records the latest-stable resolved version for every pinned dependency (Bun, Hono, Drizzle, Astro, Solid, TypeScript, oxlint, oxfmt, lefthook, `@types/bun`, `@astrojs/*`, Caddy, `@resvg/resvg-js-cli`), verified `>= floor` from `docs/spec.md`.

Non-breaking: no prior code or API to preserve; this change is the first code landing on the tree. The one compatibility promise is that the schema columns declared in `runs` and `run_shots` match `docs/spec.md` section 5.1 exactly so S2 never has to schema-migrate away from an intermediate S1a-specific layout.

## Capabilities

### New Capabilities

- `monorepo-foundation`: Root-level tooling - Bun workspaces, TypeScript base config, oxlint/oxfmt, pre-commit hooks via lefthook, `.bun-version` / `packageManager` pinning, Dependabot. Defines the contract every workspace extends.
- `shared-contract`: The `@battleship-arena/shared` package exposing the outcome enum, the closed-set error codes, the `parseShot` validator, board constants, and the `/api/health` response type. Frozen interface that backend and web both depend on.
- `backend-service`: Hono on Bun backend: config parser, error envelope, `/api/health` route, Drizzle schema for `runs`/`run_shots`, startup migrator applied inside a transaction before the HTTP listener opens, `openDatabase` primitive, `withTempDatabase` test helper, `DATABASE_PATH` test guard, `bootstrap(config)` function covered by an order-of-init test.
- `web-shell`: Astro static site with a Solid integration, a PWA manifest with three icons, a hand-rolled shell-only service worker (production-only registration), and an index page with the registration inline script.
- `infra-staging`: Infrastructure artifacts committed to the repo and ready for S1b to apply. `Caddyfile`, six systemd units, five ops scripts, `host-bootstrap.sh`, `verify-s1a.sh`, `maintenance.html`. Defines the path model (`/opt/battleship-arena`, `/opt/battleship-arena-staging`, `/var/www/...`, `/var/lib/...`, `/var/backups/...`) and the user model (`battleship`, `battleship-deploy`, `www-data`).
- `ci-pipelines`: `.github/workflows/pr.yml` and `.github/workflows/deploy-staging.yml`, plus `.github/dependabot.yml`. Defines the gating contract on `vars.STAGING_DEPLOY_ENABLED` and the split between `vars.STAGING_SSH_HOST` and `vars.STAGING_PUBLIC_URL`.
- `s1b-handover`: `docs/ops/host-bootstrap.md` and `docs/ops/version-log-2026-04-20.md`. Defines the ordered S1b runbook, the decisions S1b must record, the secrets and variables inventory, and the version-pinning audit trail.

### Modified Capabilities

None. There are no prior capabilities in `openspec/specs/`; this change is the first to land artifacts.

## Impact

- **New source code.** `shared/src/`, `backend/src/`, `web/src/`, tests, `infra/`, `.github/workflows/`, `docs/ops/`.
- **New root config files.** `package.json` with Bun workspaces, `tsconfig.base.json`, `bunfig.toml`, `.bun-version`, `.oxfmtrc.json`, `lefthook.yml`, `.editorconfig`, `.gitignore`. Existing `oxlint.json` replaced with an extended config that enables `correctness`, `perf`, `suspicious`, and `typescript` rule categories.
- **External dependencies added to `bun.lockb`.** Pinned exactly to the versions recorded in `docs/ops/version-log-2026-04-20.md`.
- **GitHub Actions settings required in S1b.** Repository secrets (`STAGING_SSH_KEY`) and variables (`STAGING_SSH_HOST`, `STAGING_SSH_KNOWN_HOSTS`, `STAGING_PUBLIC_URL`, `STAGING_DEPLOY_ENABLED`). S1a opens the PR with the variables absent; `deploy-staging.yml` tolerates that by default.
- **CI credit usage.** Every PR and every push to `main` now runs a Bun install + full build. Expected runtime under 5 minutes per run on a `ubuntu-latest` runner.
- **No changes to runtime infrastructure.** S1a commits infra files but does not execute them. Changes to live infrastructure land in the separate S1b change.
- **No changes to production data or external services.** The change touches only the repository and, through CI, GitHub Actions internal state.
