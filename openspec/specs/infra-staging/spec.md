# infra-staging Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: Caddyfile declares prod and staging vhosts with streaming-safe API proxy and maintenance gate

The repository SHALL commit `infra/Caddyfile` that defines two virtual hosts, `arena.example` (production) and `staging.arena.example` (staging). Each vhost MUST reverse-proxy requests whose path starts with `/api/` to the local backend on a distinct loopback port (production on `127.0.0.1:8081`, staging on `127.0.0.1:8082`) with `flush_interval -1` so server-sent events are not buffered and with read and write transport timeouts of at least 10 minutes so long-lived streaming connections are not cut by the proxy. Each vhost MUST set `Cache-Control: no-store` on `/api/*` responses. Each vhost MUST serve static files for every non-`/api/` path from its own web root (`/var/www/battleship-arena/web/` for production, `/var/www/battleship-arena-staging/web/` for staging) with a long-lived immutable `Cache-Control` header on fingerprinted asset paths. Both vhosts MUST import a shared `maintenance_gate` snippet that intercepts every request when the flag file `/etc/battleship-arena/maintenance.on` exists and serves the static `maintenance.html` page with HTTP status 503 and `Cache-Control: no-store`, so no request reaches the backend while the flag is present.

#### Scenario: Production vhost proxies /api/ to port 8081 with SSE-safe settings

- **WHEN** the committed `infra/Caddyfile` is inspected
- **THEN** the `arena.example` block reverse-proxies `/api/*` to `127.0.0.1:8081`, sets `flush_interval -1`, configures read and write timeouts of at least 10 minutes, and adds `Cache-Control: no-store` to `/api/*` responses

#### Scenario: Staging vhost proxies /api/ to port 8082 with SSE-safe settings

- **WHEN** the committed `infra/Caddyfile` is inspected
- **THEN** the `staging.arena.example` block reverse-proxies `/api/*` to `127.0.0.1:8082`, sets `flush_interval -1`, configures read and write timeouts of at least 10 minutes, and adds `Cache-Control: no-store` to `/api/*` responses

#### Scenario: Both vhosts serve their own web root for non-API paths

- **WHEN** the committed `infra/Caddyfile` is inspected
- **THEN** the production vhost serves static files from `/var/www/battleship-arena/web/` and the staging vhost serves static files from `/var/www/battleship-arena-staging/web/`, each with an immutable long-lived `Cache-Control` header on fingerprinted asset paths

#### Scenario: Maintenance gate snippet intercepts every request when the flag file exists

- **WHEN** the committed `infra/Caddyfile` is inspected
- **THEN** a `(maintenance_gate)` snippet is defined that matches the existence of `/etc/battleship-arena/maintenance.on` and responds with HTTP 503 serving `maintenance.html` with `Cache-Control: no-store`, and both `arena.example` and `staging.arena.example` import this snippet

### Requirement: Six systemd unit files are committed with hardening directives

The repository SHALL commit six systemd unit files under `infra/systemd/`: `battleship-arena.service`, `battleship-arena-staging.service`, `battleship-backup.service`, `battleship-backup.timer`, `battleship-offhost-rsync.service`, and `battleship-offhost-rsync.timer`. Each `.service` unit that runs application or backup code MUST set `User=battleship` and `Group=battleship` and MUST include the hardening directives `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `NoNewPrivileges=yes`, an empty `CapabilityBoundingSet=`, `RestrictAddressFamilies=` limited to `AF_INET`, `AF_INET6`, and `AF_UNIX`, and `MemoryDenyWriteExecute=yes`. The production backend unit MUST listen on port `8081` and read and write the database at `/var/lib/battleship-arena/project.db`; the staging backend unit MUST listen on port `8082` and read and write the database at `/var/lib/battleship-arena-staging/project-staging.db`. The backup timer MUST trigger hourly and the off-host rsync timer MUST trigger once daily, both with `Persistent=true` so missed runs are caught up after reboot.

#### Scenario: All six unit files are committed

- **WHEN** the contents of `infra/systemd/` are listed in the repository
- **THEN** the directory contains exactly the files `battleship-arena.service`, `battleship-arena-staging.service`, `battleship-backup.service`, `battleship-backup.timer`, `battleship-offhost-rsync.service`, and `battleship-offhost-rsync.timer`

#### Scenario: Backend units include every required hardening directive

- **WHEN** `infra/systemd/battleship-arena.service` or `infra/systemd/battleship-arena-staging.service` is inspected
- **THEN** the `[Service]` section contains `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `NoNewPrivileges=yes`, `CapabilityBoundingSet=` (empty right-hand side), `RestrictAddressFamilies=` listing only `AF_INET`, `AF_INET6`, and `AF_UNIX`, and `MemoryDenyWriteExecute=yes`

#### Scenario: Backend units bind distinct ports and database files per environment

- **WHEN** the two backend unit files are inspected
- **THEN** the production unit declares `PORT=8081` and `DATABASE_PATH=/var/lib/battleship-arena/project.db` and the staging unit declares `PORT=8082` and `DATABASE_PATH=/var/lib/battleship-arena-staging/project-staging.db`

#### Scenario: Backup and off-host timers run on their documented cadence

- **WHEN** the two timer files are inspected
- **THEN** `battleship-backup.timer` declares `OnCalendar=hourly` with `Persistent=true` and `battleship-offhost-rsync.timer` declares a once-daily `OnCalendar` value with `Persistent=true`

### Requirement: Ops scripts are safe-shell, documented, and executable with the documented behavior

The repository SHALL commit five ops scripts under `infra/scripts/`: `backup.sh`, `offhost-rsync.sh`, `maintenance-on.sh`, `maintenance-off.sh`, and `restore.sh`. Every script MUST begin with a shebang of `#!/usr/bin/env bash` followed by `set -euo pipefail`, MUST carry a usage or purpose header comment immediately after the shebang block, and MUST be committed with the executable bit set. `backup.sh` MUST invoke `VACUUM INTO` for every environment database file that is present on disk (production and staging), write the resulting snapshots into `/var/backups/battleship-arena/` with `0600` permissions, and prune older snapshots so the local retention window does not exceed the documented hourly and daily limits. `offhost-rsync.sh` MUST select the newest snapshot under `/var/backups/battleship-arena/` and rsync it to the configured off-host target resolved from an environment variable. `maintenance-on.sh` MUST create `/etc/battleship-arena/maintenance.on` and `maintenance-off.sh` MUST remove it. `restore.sh` MUST refuse to run without exactly two arguments naming the environment and the snapshot path.

#### Scenario: Every script is safe-shell with a usage header and executable

- **WHEN** any of the five ops scripts is inspected in the committed tree
- **THEN** the first line is `#!/usr/bin/env bash`, the next non-comment directive is `set -euo pipefail`, a human-readable usage or purpose comment appears in the header block, and the file mode in git includes the executable bit

#### Scenario: backup.sh snapshots every present environment and prunes by retention

- **WHEN** `backup.sh` runs on a host where both `/var/lib/battleship-arena/project.db` and `/var/lib/battleship-arena-staging/project-staging.db` exist
- **THEN** the script produces one snapshot per present database in `/var/backups/battleship-arena/` with file mode `0600` and deletes older snapshots once the configured hourly or daily retention is exceeded

#### Scenario: offhost-rsync.sh copies the newest snapshot to the configured target

- **WHEN** `offhost-rsync.sh` runs with at least one snapshot present in `/var/backups/battleship-arena/`
- **THEN** the script selects the most recently modified snapshot and invokes rsync with the target resolved from an environment variable; when no snapshots are present it exits 0 without calling rsync

#### Scenario: Maintenance scripts toggle the flag file

- **WHEN** `maintenance-on.sh` runs and then `maintenance-off.sh` runs
- **THEN** the first run creates `/etc/battleship-arena/maintenance.on` and the second run removes it; each run exits with status 0

### Requirement: host-bootstrap.sh defines the two-user ownership model for deploy and runtime

The repository SHALL commit `infra/scripts/host-bootstrap.sh` whose behavior, as described by the committed script contents, creates two system users: `battleship` (runtime identity for the backend and backup systemd units) and `battleship-deploy` (CI deploy identity used by the GitHub Actions workflow over SSH). The script MUST create backend dist target directories (`/opt/battleship-arena/backend/dist/` and `/opt/battleship-arena-staging/backend/dist/`) owned by user `battleship-deploy`, group `battleship`, with mode `2750`, and MUST create web-root target directories (`/var/www/battleship-arena/web/` for production and `/var/www/battleship-arena-staging/web/` for staging - the exact paths the Caddyfile reverse-proxy's `file_server` block serves from) owned by user `battleship-deploy`, group `www-data`, with mode `2755`. The parent directories `/var/www/battleship-arena/` and `/var/www/battleship-arena-staging/` MUST also exist with the same ownership so that the maintenance page at `/var/www/battleship-arena/maintenance.html` is readable by Caddy. Setting the setgid bit on these directories MUST be explicit in the script so that files rsynced by the deploy user inherit the runtime group automatically, letting the runtime services read through group membership while the deploy user writes without sudo. Runtime state directories under `/var/lib/battleship-arena/`, `/var/lib/battleship-arena-staging/`, and `/var/backups/battleship-arena/` MUST be owned by `battleship:battleship`.

#### Scenario: Both system users are created

- **WHEN** the committed `host-bootstrap.sh` is inspected
- **THEN** it declares idempotent creation of a system user named `battleship` and a system user named `battleship-deploy`

#### Scenario: Backend dist targets use the setgid deploy-write runtime-read model

- **WHEN** the committed `host-bootstrap.sh` is inspected
- **THEN** `/opt/battleship-arena/backend/dist/` and `/opt/battleship-arena-staging/backend/dist/` are created with owner `battleship-deploy`, group `battleship`, and mode `2750`

#### Scenario: Web-root targets use the setgid deploy-write www-data-read model

- **WHEN** the committed `host-bootstrap.sh` is inspected
- **THEN** `/var/www/battleship-arena/`, `/var/www/battleship-arena/web/`, `/var/www/battleship-arena-staging/`, and `/var/www/battleship-arena-staging/web/` are all created with owner `battleship-deploy`, group `www-data`, and mode `2755`; the `/web/` sub-directories match the exact paths the Caddy `file_server` block serves from

#### Scenario: Runtime state directories are owned by the runtime user

- **WHEN** the committed `host-bootstrap.sh` is inspected
- **THEN** `/var/lib/battleship-arena/`, `/var/lib/battleship-arena-staging/`, and `/var/backups/battleship-arena/` are created owned by `battleship:battleship`

### Requirement: host-bootstrap.sh installs the maintenance page once and both vhosts reuse it

The committed `host-bootstrap.sh` MUST copy `infra/maintenance.html` from the checked-out repository to `/var/www/battleship-arena/maintenance.html` during host provisioning so that the Caddy `(maintenance_gate)` snippet has a served file available regardless of which vhost (production or staging) is under hard maintenance. The installation step MUST set readable file permissions for the Caddy runtime user (group `www-data`) and MUST NOT copy the file into the staging web root separately, because the `maintenance_gate` snippet always serves from the production web root.

#### Scenario: Maintenance page is installed once to the production web root

- **WHEN** the committed `host-bootstrap.sh` is inspected
- **THEN** it installs `infra/maintenance.html` to `/var/www/battleship-arena/maintenance.html` with mode `0644` and group `www-data` and does not install a second copy under the staging web root

### Requirement: host-bootstrap.sh is idempotent

The committed `host-bootstrap.sh` MUST produce the same end state whether it runs once or is re-run on an already-provisioned host. User creation, directory creation, maintenance-page installation, unit-file installation, and unit enablement MUST all be expressed with commands that treat an already-correct state as success and that do not raise when re-applied.

#### Scenario: Second run of host-bootstrap.sh does not fail

- **WHEN** `host-bootstrap.sh` is run twice in succession on a freshly provisioned host
- **THEN** the second run exits with status 0 and the end state (users, directories, modes, owners, installed units, maintenance page) is identical to the end state after the first run

### Requirement: verify-s1a.sh is the single source of truth for S1a definition-of-done

The repository SHALL commit `infra/scripts/verify-s1a.sh` which MUST, in order: run `bun install --frozen-lockfile`, run the project-wide lint, format check, typecheck, and test commands (with tests invoked under `DATABASE_PATH=:memory:`), run the project-wide build, start the backend process against a temporary database file named `dev-verify.db`, assert that `GET /api/health` returns a body whose JSON contains `status: "ok"`, terminate the backend process and remove the temporary database files, build the web package, and finally assert that `web/dist/sw.js`, `web/dist/index.html`, and `web/dist/manifest.webmanifest` all exist on disk. The script MUST exit non-zero if any step fails and MUST print a clear success marker after every step has passed. The same script MUST be callable both locally by a developer on a fresh clone and by CI as the final step of the PR workflow.

#### Scenario: verify-s1a.sh runs the full pre-build quality gate

- **WHEN** `verify-s1a.sh` runs on a fresh clone
- **THEN** it invokes, in order, `bun install --frozen-lockfile`, the lint command, the format-check command, the typecheck command, and the test command with `DATABASE_PATH=:memory:`, and aborts the run on the first non-zero exit

#### Scenario: verify-s1a.sh proves /api/health works against a temporary database

- **WHEN** `verify-s1a.sh` reaches its backend-health step
- **THEN** it launches the backend with `DATABASE_PATH=./dev-verify.db` on a dedicated port, asserts the response body from `/api/health` contains `"status":"ok"`, then kills the backend and deletes `dev-verify.db` and its auxiliary WAL or SHM files

#### Scenario: verify-s1a.sh asserts the web build produced the PWA shell files

- **WHEN** `verify-s1a.sh` runs the web build step
- **THEN** after the build it asserts that `web/dist/sw.js`, `web/dist/index.html`, and `web/dist/manifest.webmanifest` all exist and it prints a success marker only when every prior step has passed

### Requirement: maintenance.html is a self-contained HTML5 page

The repository SHALL commit `infra/maintenance.html` as a standalone HTML5 document that declares `<!doctype html>`, includes a `<meta charset>`, includes a responsive `<meta name="viewport">`, carries all styling inline in a single `<style>` block, and references no external resources such as stylesheets, scripts, fonts, images, or analytics beacons. The page MUST remain usable when served by Caddy as the body of a 503 response while the backend is offline and while no network other than the static file read is available.

#### Scenario: Maintenance page has no external references

- **WHEN** `infra/maintenance.html` is inspected
- **THEN** it contains no `<link>` to an external stylesheet, no `<script src=...>`, no `<img src=...>` pointing off-host, no `@font-face` external URL, and no other tag that issues a network request beyond the page itself

#### Scenario: Maintenance page is a valid mobile-friendly HTML5 document

- **WHEN** `infra/maintenance.html` is inspected
- **THEN** it begins with `<!doctype html>`, declares `<meta charset="utf-8">`, declares `<meta name="viewport" content="width=device-width, initial-scale=1">`, and contains its CSS inside a single inline `<style>` block

### Requirement: S1a commits infrastructure files without executing them

All infrastructure artifacts enumerated by this capability SHALL be committed to the `infra/` directory of the repository during the S1a change. The S1a change MUST NOT execute any of these artifacts on a live host: no user is created, no directory is provisioned, no systemd unit is installed or enabled, no Caddy instance is reloaded, no backup runs, and no off-host rsync target is contacted as part of S1a. The application of these artifacts to a live host is reserved for the separate S1b change, which runs `host-bootstrap.sh` and installs the committed unit files, Caddyfile, and maintenance page.

#### Scenario: Infra directory contains every artifact after S1a lands

- **WHEN** the repository tree is inspected on the commit that lands S1a
- **THEN** `infra/Caddyfile`, `infra/maintenance.html`, the six files under `infra/systemd/`, and the seven scripts under `infra/scripts/` (`backup.sh`, `offhost-rsync.sh`, `maintenance-on.sh`, `maintenance-off.sh`, `restore.sh`, `host-bootstrap.sh`, `verify-s1a.sh`) are all present

#### Scenario: S1a does not touch a live host

- **WHEN** the S1a change is applied to the repository and its CI runs
- **THEN** no CI job or local verification step invokes `host-bootstrap.sh`, `systemctl`, `caddy reload`, `backup.sh`, `offhost-rsync.sh`, `maintenance-on.sh`, `maintenance-off.sh`, or `restore.sh` against a remote host, and the application of infra files to a live host is deferred to the S1b change
