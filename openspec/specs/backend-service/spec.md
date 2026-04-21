# backend-service Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: Health endpoint reports service identity

The backend SHALL expose `GET /api/health` that responds with HTTP status 200 and a JSON body `{ status: "ok", version, commitSha, startedAt }`. The `version` value MUST be read from the backend's `package.json`. The `commitSha` value MUST be read from the `COMMIT_SHA` environment variable and fall back to the literal string `"unknown"` when that variable is empty or absent. The `startedAt` value MUST be the process-boot timestamp captured in milliseconds since the Unix epoch at the moment the backend process started, and MUST remain constant for the lifetime of that process.

#### Scenario: Health endpoint returns service identity

- **WHEN** a client sends `GET /api/health` to a running backend whose `COMMIT_SHA` env var is set to `abc123`
- **THEN** the response status is 200 and the JSON body is `{ status: "ok", version: <package.json version>, commitSha: "abc123", startedAt: <boot ms> }` with the same `startedAt` returned on every subsequent request within that process

#### Scenario: Missing commit SHA falls back to unknown

- **WHEN** a client sends `GET /api/health` to a running backend started without a `COMMIT_SHA` environment variable
- **THEN** the response body's `commitSha` field equals the literal string `"unknown"`

### Requirement: Non-2xx responses use the closed-set error envelope

Every non-2xx response SHALL be serialized using the envelope `{ error: { code, message, detail? } }` defined by the `shared` package, where `code` is drawn from the closed-set error-code enum. Requests to routes that are not registered SHALL return HTTP status 404 with an envelope whose `code` field equals `not_found`. The envelope SHALL NOT contain stack traces, raw provider output, or any field not part of the documented shape.

#### Scenario: Unknown route returns not_found envelope

- **WHEN** a client sends a request to a path that is not registered on the backend
- **THEN** the response status is 404 and the JSON body equals `{ error: { code: "not_found", message: <human-readable summary> } }`

#### Scenario: Error envelope shape is closed

- **WHEN** any non-2xx response is produced by the backend
- **THEN** the response body is a JSON object whose only top-level key is `error`, whose `error.code` is a member of the shared error-code enum, and whose optional `error.detail` (if present) is an object

### Requirement: Config loader parses and validates environment

A config loader SHALL read `DATABASE_PATH`, `PORT`, `MAINTENANCE_SOFT`, `SHUTDOWN_GRACE_SEC`, `VERSION`, and `COMMIT_SHA` from `process.env`. The loader MUST reject configuration that omits `DATABASE_PATH`, that sets `PORT` to a value which is not a positive integer, or that sets `SHUTDOWN_GRACE_SEC` to a negative number. On rejection the loader MUST exit the process with a non-zero status and a readable message identifying the offending key; on success it MUST return a typed configuration object consumed by `bootstrap`.

#### Scenario: Missing DATABASE_PATH aborts startup

- **WHEN** the backend is launched without a `DATABASE_PATH` environment variable
- **THEN** the config loader exits the process with a non-zero status and a message naming `DATABASE_PATH` as the missing key

#### Scenario: Non-numeric PORT aborts startup

- **WHEN** the backend is launched with `PORT` set to a value that is not a positive integer
- **THEN** the config loader exits the process with a non-zero status and a message naming `PORT` as the invalid key

#### Scenario: Negative SHUTDOWN_GRACE_SEC aborts startup

- **WHEN** the backend is launched with `SHUTDOWN_GRACE_SEC` set to a negative number
- **THEN** the config loader exits the process with a non-zero status and a message naming `SHUTDOWN_GRACE_SEC` as the invalid key

#### Scenario: Valid config is returned as a typed object

- **WHEN** every required variable is present and well-typed
- **THEN** the loader returns a configuration object whose fields match the parsed environment values and no process exit occurs

### Requirement: Drizzle schema declares runs and run_shots

The backend SHALL declare a Drizzle schema for two tables, `runs` and `run_shots`, whose columns match the complete list defined in `docs/spec.md` section 5.1. The `runs` table MUST include `id` (text primary key), `seed_date`, `provider_id`, `model_id`, `display_name`, `started_at`, `ended_at`, `outcome`, `shots_fired`, `hits`, `schema_errors`, `invalid_coordinates`, `duration_ms`, `tokens_in`, `tokens_out`, `reasoning_tokens`, `cost_usd_micros`, `budget_usd_micros`, and `client_session`. The `run_shots` table MUST include `run_id`, `idx`, `row`, `col`, `result`, `raw_response`, `reasoning_text`, `tokens_in`, `tokens_out`, `reasoning_tokens`, `cost_usd_micros`, `duration_ms`, and `created_at`, and MUST declare a composite primary key `(run_id, idx)`. The `run_shots.run_id` column MUST be a foreign key that references `runs.id` and cascades on delete. Foreign-key enforcement MUST be enabled on every database handle the backend opens.

#### Scenario: runs table has the full column set

- **WHEN** the schema declaration is inspected against `docs/spec.md` section 5.1
- **THEN** the `runs` table declaration contains each column listed in that section with its documented type

#### Scenario: run_shots has composite primary key and cascading FK

- **WHEN** a row is inserted into `runs` and rows are inserted into `run_shots` referencing its `id`
- **THEN** `run_shots` rejects two rows with the same `(run_id, idx)` pair and deleting the parent `runs` row removes the dependent `run_shots` rows automatically

#### Scenario: Foreign keys are enforced on every handle

- **WHEN** the backend opens any database handle through its runtime primitive
- **THEN** inserting into `run_shots` with a `run_id` that does not exist in `runs` fails with a foreign-key violation

### Requirement: Startup migrator applies migrations before the listener binds

On startup the backend SHALL apply every pending Drizzle migration inside a single SQL transaction before the HTTP listener is allowed to accept connections. If any migration step fails, the transaction MUST be rolled back, the HTTP listener MUST NOT be opened, and the process MUST exit with a non-zero status. Migration files are immutable once committed; a corrective change is expressed as a new migration, never as an in-place edit of a prior file.

#### Scenario: Pending migrations are applied before listener opens

- **WHEN** the backend starts against a database that has unapplied migrations
- **THEN** the migrations are applied inside one transaction and the HTTP listener starts accepting connections only after the transaction commits

#### Scenario: Migration failure aborts startup

- **WHEN** a migration step raises an error during startup
- **THEN** the transaction is rolled back, no HTTP listener is opened on the configured port, and the process exits with a non-zero status

### Requirement: openDatabase is the only runtime primitive that constructs a Database

The backend SHALL expose an `openDatabase(path)` primitive as the sole runtime code path that calls `new Database(...)`. Before returning the handle, `openDatabase` MUST enable WAL journaling and set `PRAGMA foreign_keys = ON`. Every other backend module and every test helper that needs a database handle MUST obtain it by calling `openDatabase` either directly or through another helper that delegates to it.

#### Scenario: openDatabase enables WAL and foreign keys

- **WHEN** `openDatabase(path)` is invoked with a valid filesystem path
- **THEN** the returned handle reports `journal_mode` as `wal` and `foreign_keys` as `on` when those pragmas are queried

#### Scenario: No other module instantiates Database directly

- **WHEN** the backend source tree is searched for calls to `new Database(`
- **THEN** the only match is inside the `openDatabase` primitive's implementation

### Requirement: withTempDatabase is a test-only helper with guaranteed cleanup

The backend test suite SHALL expose `withTempDatabase(callback)` that creates a unique SQLite database file under `/tmp/`, opens it through `openDatabase`, applies pending migrations, invokes the callback with the resulting handle, and then closes the handle and unlinks the file along with its WAL and SHM sidecars. Cleanup MUST occur whether the callback returns normally or throws. The helper MUST NOT be reachable from production code paths.

#### Scenario: Callback sees a migrated database

- **WHEN** `withTempDatabase(callback)` is invoked with a callback that queries `sqlite_master`
- **THEN** the callback receives a database handle whose `sqlite_master` lists the `runs` and `run_shots` tables

#### Scenario: Temp file and sidecars are removed after a successful callback

- **WHEN** a callback passed to `withTempDatabase` returns without throwing
- **THEN** the helper closes the handle and the temp file, its `-wal` sidecar, and its `-shm` sidecar no longer exist on disk

#### Scenario: Temp file and sidecars are removed after a throwing callback

- **WHEN** a callback passed to `withTempDatabase` throws an exception
- **THEN** the helper re-raises the exception to the caller, closes the handle, and the temp file together with its `-wal` and `-shm` sidecars no longer exist on disk

### Requirement: DATABASE_PATH test guard blocks unsafe paths

The file `backend/tests/setup.ts` SHALL be preloaded by Bun's test runner and MUST abort the entire test suite before any query runs if `DATABASE_PATH` is set to any value that is not the literal string `:memory:`, does not start with the prefix `/tmp/`, and does not contain the substring `-test-`. When `DATABASE_PATH` is unset the guard MUST treat the configuration as unsafe and abort. The guard's rejection MUST prevent the suite from opening any database handle against the offending path.

#### Scenario: Safe DATABASE_PATH is accepted

- **WHEN** the test runner is started with `DATABASE_PATH=:memory:`, `DATABASE_PATH=/tmp/bsa-abc.db`, or `DATABASE_PATH=./dev-test-foo.db`
- **THEN** the guard allows the suite to proceed and no process exit occurs

#### Scenario: Unsafe DATABASE_PATH aborts the suite

- **WHEN** the test runner is started with `DATABASE_PATH=./project.db` or any other value that is neither `:memory:`, nor prefixed with `/tmp/`, nor contains `-test-`
- **THEN** the guard aborts the suite with a non-zero exit code and no database query runs

### Requirement: bootstrap(config) wires startup order and returns a handle

The backend SHALL expose a `bootstrap(config)` function that, when given a valid configuration object, opens the database via `openDatabase`, applies pending migrations inside a transaction, constructs the Hono app via the app factory, starts `Bun.serve` on the configured port, and returns a handle `{ server, sqlite, config }`. The returned handle's `server` MUST refer to the running `Bun.serve` instance, `sqlite` MUST refer to the open database handle, and `config` MUST be the configuration object passed in. The contract guarantees that by the time `bootstrap` returns, migrations have completed and the HTTP listener is accepting connections.

#### Scenario: bootstrap returns a handle with server, sqlite, and config

- **WHEN** `bootstrap(config)` is awaited with a valid configuration
- **THEN** it returns an object whose `server`, `sqlite`, and `config` fields are all populated and non-null

#### Scenario: Migrations complete before the listener accepts connections

- **WHEN** `bootstrap(config)` has resolved and a client sends `GET /api/health` to the returned server
- **THEN** the response status is 200 and an inspection of the database through the returned `sqlite` handle reports that `runs` and `run_shots` exist in `sqlite_master`
