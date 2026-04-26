# BattleShipArena Technical Specification

This document is the technical contract for the MVP. The product-level framing (what the app does, for whom, and why) lives in `docs/about.md` and is not repeated here. Every technical choice below is recorded together with the reasoning that produced it; the reasoning is part of the contract and must stay in the document.

## 1. System overview and surfaces

### 1.1 Topology

The system runs on a single host as one backend process behind a reverse proxy; the frontend is a static build served by the same proxy from disk. There is no separate frontend process at runtime.

- **Frontend bundle.** Astro app compiled to static files (`web/dist/`): mobile-first PWA shell plus Solid islands for interactive regions (game view, replay viewer, provider picker). The build output is an immutable directory.
- **Backend process.** Hono HTTP server on Bun, owning all business logic, the database, the provider adapters, and the live-run state.
- **Reverse proxy.** Caddy 2 terminates TLS, serves the static frontend from disk, and proxies `/api/*` to the backend.

Routing:

- `/` and all static assets -> Caddy serves `web/dist/` from disk.
- `/api/*` (including `/api/runs/:id/events` for the live SSE stream) -> Caddy reverse-proxies to Hono with `flush_interval -1` so SSE is not buffered.

Two independent systemd units run the same code with different environment variables and ports:

- `battleship-arena.service` -> production, database file `project.db`.
- `battleship-arena-staging.service` -> staging, database file `project-staging.db`, different port. E2E tests only run against staging.

### 1.2 User-visible surfaces

- **Leaderboard + today's board** (home).
- **Play page** (pick a provider, pick an exact model, paste API key, declare a max-spend budget, press start).
- **Live game view** (SSE feed of shots, running metrics).
- **Replay viewer** (scrubbable playback of any archived run).

### 1.3 Internal surfaces

- Hono HTTP API under `/api` (see section 5).
- SSE stream under `/api/runs/:id/events`.
- Provider adapter interface under `backend/src/providers/` (see section 6).

## 2. Tools and minimum versions

The versions below are **minimum floors**, not exact pins. Per the version policy in `CLAUDE.md`, the project pins to the latest stable release that is greater than or equal to the floor. Downgrade is forbidden. Upgrade is encouraged and should happen in the same PR that bumps the floor.

| Tool          | Role                                                 | Minimum version |
| ------------- | ---------------------------------------------------- | --------------- |
| Bun           | JS/TS runtime, package manager, test runner, bundler | 1.3.12          |
| Hono          | Backend HTTP framework                               | 4.12.14         |
| Drizzle ORM   | Type-safe SQL over `bun:sqlite`                      | 0.45.2          |
| Drizzle Kit   | Migration generation and runner                      | 0.31.10         |
| TypeScript    | Source language                                      | 6.0.2           |
| Astro         | Frontend framework / static shell                    | 6.1.7           |
| Solid.js      | Interactive islands on Astro                         | 1.9.12          |
| CSS Modules   | Component-scoped styles                              | (bundled)       |
| oxlint        | Linter                                               | 1.60.0          |
| oxfmt         | Formatter                                            | 0.45.0          |
| Playwright    | E2E tests against staging only                       | 1.59.1          |
| sqlite3 (CLI) | Backup driver (`VACUUM INTO`)                        | 3.45            |
| Caddy         | Reverse proxy / TLS                                  | 2.x             |

Before any `bun add`, `bun install`, or pin bump, the exact latest stable must be verified from the official source (npm, GitHub Releases, vendor docs) and pinned if newer than the floor.

## 3. Game rules and data formats

### 3.1 Board

- 10x10 grid, cells indexed 0-9 on both axes.
- Classic fleet, 17 occupied cells total: carrier (5), battleship (4), cruiser (3), submarine (3), destroyer (2).
- Ships never overlap. Ships may only be placed orthogonally (horizontal or vertical), never diagonally. Ships are not adjacent by default (no two ships share an edge); this is part of the seeded generator's rule set.

### 3.2 Daily seed and determinism

- The seed is `YYYY-MM-DD` in UTC.
- A deterministic PRNG consumes the seed and produces the ship layout. The generator is a pure function of the seed string. Same seed, same layout, everywhere.
- There is no `boards` table. The layout is recomputed on demand and cached in memory per process. The seed itself is the canonical record.
- Board rollover happens at UTC 00:00. A run started before rollover finishes on yesterday's seed; a run started after rollover uses today's seed.

**Why derive and not persist.** The seed is the record. Persisting a redundant layout invites drift if the generator is ever corrected, and adds a table whose only job is to repeat information that already exists. A deterministic generator is also the honest answer to "can this leaderboard be verified independently" - anyone with the seed can reproduce the board.

### 3.3 Model input per turn

Every turn, the active provider call carries:

- **A compact text board** whose first line is `ABCDEFGHIJ`, followed by rows `01` through `10`. Cell symbols are `.` for unknown, `o` for miss, `X` for an unsunk hit, and `S` for a fully sunk ship cell.
- **A rule-filtered candidate list** generated by the backend from the visible board state. Target mode lists adjacent unknown cells around current unsunk `X` hits, capped at 8 cells and ordered seed-stably without direction hints. Hunt mode lists up to 4 distributed checkerboard candidates. Candidate cells adjacent to sunk `S` cells, including diagonals, are removed because ships cannot touch.
- **A short text preamble** that lists remaining ship names only in target mode, where it helps local hit-followup decisions. Hunt mode omits remaining ship lengths to avoid inviting global placement reconstruction.
- **A fixed system instruction** describing the output contract in section 3.4.

The PNG renderer remains in the codebase for the board preview and for a future vision-track fallback, but the current real-provider benchmark path sends text board state only.

**Why text board + candidate list.** The real-provider experiments showed that some target providers either cannot accept image input on the relevant route or spend the entire completion budget in hidden reasoning when asked to reconstruct move legality from a full board. The backend therefore performs deterministic legality filtering, while the model still chooses the shot from multiple rule-filtered candidates whenever multiple candidates exist. Exact backend-selected fallback is allowed only when the rule-filtered board truly has one candidate.

### 3.4 Model output contract

The model must return a single JSON object in its plain text response:

```json
{ "cell": "A1" }
```

- `cell` is a column letter `A` through `J` followed by row `1` through `10`; zero-padded rows such as `A01` are accepted by the parser but are not the canonical prompt shape.
- The parser also accepts the legacy object `{ "row": 0, "col": 0 }` for backward compatibility with older adapters and fixtures. `row` and `col` are zero-based integers in `[0, 9]`.
- `reasoning` is optional for both canonical `cell` responses and legacy row/col responses, never validated beyond being a string if present, and shown to the viewer as an inline caption.
- Schema validation failures cover JSON parsing and structural issues only: wrong keys, malformed `cell` notation such as `K1`, out-of-range legacy coordinates such as `row: 11`, parse failure, or empty visible content. Duplicate shots are handled later by shot resolution and recorded as `invalid_coordinate`, not `schema_error`.

No provider's structured-output mode, tool-calling mode, or JSON-schema decoder is ever used. Every provider receives the same plain prompt and returns plain text. The backend parses and validates. This matches the brainstorm answer to Q3.

**Why plain text + server validation, not provider structured output.** `about.md` advertises schema errors as a first-class metric. A provider that ships a schema-enforcing decoder would collapse that metric to zero for every model it hosts, while a provider without one would produce numbers that say nothing about the model's own discipline. The benchmark would then measure provider feature parity, not model behavior.

**Why `cell` notation.** The text board already labels columns with letters and rows with human-readable row numbers, so a single `cell` value mirrors the prompt surface and avoids exposing zero-based implementation coordinates as the primary model-facing contract. The server still normalizes to numeric row/col internally for storage and board resolution.

### 3.5 Shot resolution

After a valid shot:

- If the cell is unoccupied -> miss.
- If the cell is occupied and the ship still has unhit cells -> hit.
- If the cell is occupied and was the last unhit cell of that ship -> sink (the ship is removed from the ships-remaining list on the next turn).
- If the cell was already shot in this run, or if the reported coordinate is out of range for the board -> `invalid_coordinate` error. The turn is recorded in `run_shots` with `result = invalid_coordinate`, consumes the shot cap like a miss, increments `runs.invalid_coordinates`, but does **not** accumulate toward the consecutive schema-error threshold.
- If the model returns unparsable JSON, the wrong shape, or empty visible content -> `schema_error`. The row has `row = NULL` and `col = NULL`, consumes a shot attempt, increments the schema-error counters, and accumulates toward the consecutive schema-error threshold.
- If the per-turn provider timeout fires before a usable provider output is available -> `timeout`. The row has `row = NULL` and `col = NULL`, consumes a shot attempt, increments the same consecutive output-failure threshold as `schema_error`, but remains distinguishable in `run_shots.result` and in the live UI.

**Why split `invalid_coordinate` from `schema_error`.** A model that returns perfectly shaped JSON but targets a cell it already shot is failing at spatial memory. A model that returns prose instead of JSON is failing at schema discipline. Collapsing them would erase the single most diagnostic distinction this benchmark can produce.

## 4. Lifecycle policies

### 4.1 Run lifecycle

1. `POST /api/runs` arrives with provider ID, model ID, API key, and optional budget.
2. The backend allocates a run ID, persists a `runs` row in state `running`, and spawns an in-process async task.
3. The task loop (per turn):
   a. Render the current board as compact text.
   b. Build the rule-filtered candidate list and provider prompt.
   c. Call the provider adapter with text board state + candidate guidance + system instruction + API key.
   d. Parse and validate the response.
   e. Apply shot, record `schema_error`, or record `timeout`.
   f. Emit SSE event on the run's in-memory ring.
   g. Persist the turn row to `run_shots`.
   h. Check terminal conditions.
4. On terminal state, the task writes the final `outcome` and aggregate metrics to the `runs` row, drops the API key from memory, closes the SSE ring, and exits.

**Why SSE + in-process, not WebSocket, not resumable-across-restart.** SSE is purpose-built for "server pushes, client watches" and carries a built-in resume mechanism (`Last-Event-ID`) that handles the realistic failure mode (mobile tab dropping Wi-Fi for ten seconds). WebSockets would add full-duplex framing, ping/pong, and a more stateful connection model for no benefit, because the viewer never sends upstream after the run starts. A "resume across server restart" design would require either keeping user API keys alive past the session or re-prompting the user to paste a key for their old run; the first breaks the key-handling promise in `about.md`, the second is hostile to the mobile-first flow. Ephemeral in-process tasks, with `aborted_server_restart` as an honest outcome label, match the product promise exactly.

### 4.2 Terminal outcomes

Exactly one of:

- `won` - all 17 ship cells hit.
- `dnf_shot_cap` - 100 legal shots fired without winning (the full board is covered).
- `dnf_schema_errors` - 5 consecutive output failures (`schema_error` or `timeout`; `invalid_coordinate` turns consume the shot cap but do not accumulate toward this threshold).
- `dnf_budget` - cumulative cost for the run has met or crossed the user-declared budget.
- `llm_unreachable` - the provider adapter raised `ProviderError { kind: "unreachable" }` (bad key, revoked access, quota exhausted, or caller-side provider rejection). The run terminates without inserting a shot row and without touching schema-error counters.
- `aborted_viewer` - an explicit `POST /api/runs/:id/abort` arrived.
- `aborted_server_restart` - the backend process stopped (planned or unplanned) while the run was in-flight and the grace window did not finish it in time.

The schema-error DNF threshold is 5 consecutive, not 5 total. A model that self-corrects does not get punished for a single fluke; a model that is genuinely unable to hold a format, or repeatedly times out without producing a usable shot, cannot burn unbounded tokens.

**Graceful drain on SIGTERM.** On a planned stop (`systemctl restart`, soft-maintenance toggle), the backend flips a `DRAINING` flag, rejects new `POST /api/runs` with `maintenance_soft`, and waits up to `SHUTDOWN_GRACE_SEC` (default 300) for active runs to reach their own terminal state. SSE subscribers keep receiving events during the drain. Only runs still in-flight when the grace window elapses — or runs killed without notice (OOM, kernel reset, `SIGKILL`) — receive `aborted_server_restart`. Under a healthy deploy, the grace window produces zero `aborted_server_restart` outcomes.

### 4.3 API key lifetime

- Accepted only over HTTPS terminated by Caddy.
- Held in the run task's closure for the duration of that run.
- Never written to SQLite, never logged, never echoed back in any response or SSE event.
- Dropped from memory as soon as the task reaches a terminal state.
- On process restart, any in-flight run becomes `aborted_server_restart`, which also drops the key.

### 4.4 SSE stream lifetime

- The stream opens when a viewer requests `GET /api/runs/:id/events`.
- Events are buffered in an in-memory ring (size: 200 events) per active run, keyed by run ID. The ring lets a viewer reconnecting with `Last-Event-ID` receive missed events back to the ring horizon.
- When the run reaches a terminal state, the server emits a final `outcome` event and closes the stream. Late subscribers to a finished run receive the full event list from the database instead (see `/api/runs/:id/shots`).

### 4.5 Leaderboard write policy

- Only `won` runs feed the leaderboard.
- Today dedupes wins to one best row per `(client_session, provider_id, model_id)` and then returns the best cross-session win per `(provider_id, model_id)`.
- All-time dedupes wins to one best row per `(client_session, provider_id, model_id, seed_date)` before grouping by `(provider_id, model_id)` and computing the median shots to win.
- Same `model_id` values from different providers remain separate rows.

### 4.6 Retention

- Runs and shots are kept indefinitely in MVP. There is no automatic pruning.

## 5. Data model, endpoints, and error format

### 5.1 Database

SQLite via `bun:sqlite`, accessed through Drizzle ORM for type-safe queries. One database file per systemd unit (`project.db`, `project-staging.db`). Schema evolution uses Drizzle Kit: the schema is declared in `backend/db/schema.ts`, migrations are generated with `drizzle-kit generate` into `backend/db/migrations/`, and the backend applies any pending migrations inside a single transaction on startup before opening the HTTP listener. Migration files are immutable once committed — a fix is a new migration, not an edit in place. Foreign keys are ON.

#### 5.1.1 `runs`

| Column                | Type    | Notes                                                                                                                                                                                   |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | TEXT PK | ULID, generated server-side.                                                                                                                                                            |
| `seed_date`           | TEXT    | `YYYY-MM-DD` UTC.                                                                                                                                                                       |
| `provider_id`         | TEXT    | Short slug (`openrouter`, `opencode-go`, `zai`, `mock`).                                                                                                                                |
| `model_id`            | TEXT    | Exact provider identifier (for example `gpt-4o-2024-11-20`).                                                                                                                            |
| `display_name`        | TEXT    | Provider's human-readable name at run time.                                                                                                                                             |
| `started_at`          | INTEGER | Unix ms.                                                                                                                                                                                |
| `ended_at`            | INTEGER | Unix ms, nullable while running.                                                                                                                                                        |
| `outcome`             | TEXT    | One of the values in section 4.2, nullable while running.                                                                                                                               |
| `shots_fired`         | INTEGER | Recorded shot attempts, including `schema_error`, `timeout`, and `invalid_coordinate` rows.                                                                                             |
| `hits`                | INTEGER |                                                                                                                                                                                         |
| `schema_errors`       | INTEGER | Cumulative output failures (`schema_error` plus `timeout`) over the run. Only the _consecutive_ count gates `dnf_schema_errors`; `run_shots.result` keeps timeout rows distinguishable. |
| `invalid_coordinates` | INTEGER | Cumulative count of duplicate-shot or out-of-range turns.                                                                                                                               |
| `duration_ms`         | INTEGER | Wall-clock from first request to terminal state.                                                                                                                                        |
| `tokens_in`           | INTEGER |                                                                                                                                                                                         |
| `tokens_out`          | INTEGER |                                                                                                                                                                                         |
| `reasoning_tokens`    | INTEGER | Nullable when the provider does not report it.                                                                                                                                          |
| `cost_usd_micros`     | INTEGER | Cost in USD x 1,000,000 (integer math avoids FP drift).                                                                                                                                 |
| `budget_usd_micros`   | INTEGER | User-declared cap at start, nullable means no cap.                                                                                                                                      |
| `client_session`      | TEXT    | Opaque per-session token; never a user identity.                                                                                                                                        |

#### 5.1.2 `run_shots`

| Column             | Type    | Notes                                                                                                                                                                                                                              |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_id`           | TEXT    | FK `runs.id`.                                                                                                                                                                                                                      |
| `idx`              | INTEGER | 0-based position in the run.                                                                                                                                                                                                       |
| `row`              | INTEGER | Nullable when the row value cannot be parsed or is out of range.                                                                                                                                                                   |
| `col`              | INTEGER | Nullable when the col value cannot be parsed or is out of range.                                                                                                                                                                   |
| `result`           | TEXT    | `hit` \| `miss` \| `sunk` \| `schema_error` \| `invalid_coordinate` \| `timeout`.                                                                                                                                                  |
| `raw_response`     | TEXT    | Reasoning/thinking blocks stripped first, then the final user-visible response serialized, then truncated to 8 KiB. Without the strip-first step, an 8 KiB cap on a reasoning model fills with thinking and loses the actual shot. |
| `reasoning_text`   | TEXT    | Parsed `reasoning` field if any, truncated to 2 KiB.                                                                                                                                                                               |
| `llm_error`        | TEXT    | Redacted provider error metadata for transient provider failures, nullable otherwise.                                                                                                                                              |
| `tokens_in`        | INTEGER |                                                                                                                                                                                                                                    |
| `tokens_out`       | INTEGER |                                                                                                                                                                                                                                    |
| `reasoning_tokens` | INTEGER | Nullable.                                                                                                                                                                                                                          |
| `cost_usd_micros`  | INTEGER |                                                                                                                                                                                                                                    |
| `duration_ms`      | INTEGER | Wall-clock of the provider call.                                                                                                                                                                                                   |
| `created_at`       | INTEGER | Unix ms.                                                                                                                                                                                                                           |
| PRIMARY KEY        |         | `(run_id, idx)`.                                                                                                                                                                                                                   |

Indexes: `runs(seed_date, outcome)`, `runs(model_id, outcome, shots_fired)`, `run_shots(run_id, idx)`.

### 5.2 Endpoints

All endpoints live under `/api`. Request and response bodies are JSON unless noted. All responses set `Cache-Control` appropriately; mutating endpoints always set `no-store`.

- `GET /api/providers` -> list of supported real providers and their currently priced model IDs. Each priced model returns `pricing` (`inputUsdPerMtok`, `outputUsdPerMtok`, optional `reasoningUsdPerMtok`), estimator token counts, `estimatedCostRange` (`minUsd`, `maxUsd`; min assumes a 17-shot perfect win, max assumes the 100-shot cap is hit), `priceSource`, and `lastReviewedAt`. The `/play` page surfaces the range before starting. The response uses `ETag` and excludes `mock`.
- `GET /api/board?date=YYYY-MM-DD` -> the rendered PNG for that UTC date (today by default). Safe to cache per date.
- `POST /api/runs` -> start a run. Body: `{ providerId, modelId, apiKey, budgetUsd? }`. `budgetUsd` absent, `null`, or `0` means no cap; positive values are stored as floor USD micros; negative or non-numeric values are `invalid_input`. In non-production mock flows, `mockCost` may be supplied for budget smoke tests. Returns `{ runId }`. The API key is consumed synchronously into the task closure and is not echoed.
- `GET /api/runs/:id` -> run metadata (everything in `runs` except sensitive or large fields).
- `GET /api/runs/:id/shots` -> full shot list for replay.
- `GET /api/runs/:id/events` -> SSE stream for live viewing. Respects `Last-Event-ID`.
- `POST /api/runs/:id/abort` -> sets outcome to `aborted_viewer`.
- `GET /api/leaderboard?scope=today|all&providerId?=&modelId?=` -> ranked rows keyed by `(providerId, modelId)` with deduping rules from section 4.5. `scope` is required. Responses are `no-store`.
- `GET /api/status` -> `{ serverTime, version, maintenance: { untilAt, message } | null }`. The frontend polls this every ~10 s to render the `MaintenanceBanner`.
- `POST /api/admin/maintenance` -> announce a soft-maintenance window. Body: `{ untilAt, message }`. Requires the `X-Admin-Token` header.
- `DELETE /api/admin/maintenance` -> clear the active announcement. Requires `X-Admin-Token`.
- `GET /api/openapi.json` -> the OpenAPI 3.1 document describing every endpoint in this section with their request/response schemas. Cacheable (`public, max-age=60`). Source of truth lives in `backend/src/api/openapi.ts`.
- `GET /api/docs` -> interactive Swagger UI. Loads the spec from `/api/openapi.json` and lets an operator try each endpoint from the browser. Served by `@hono/swagger-ui`. The page is public; the backend does not protect it because the API itself is public-read except for the `POST /api/runs` body (which carries the user's own API key and is not persisted).

### 5.3 Error format

Every non-2xx response has the shape:

```json
{
  "error": {
    "code": "snake_case_identifier",
    "message": "Human-readable summary.",
    "detail": {}
  }
}
```

- `code` is drawn from a closed set (for example `invalid_input`, `not_found`, `run_terminal`, `provider_unavailable`, `budget_required`, `rate_limited`, `internal`).
- `message` is safe to display; it never contains the user's API key, raw model output, or stack traces.
- `detail` is optional and may carry field-level validation errors or provider error codes. Its shape is per-code and documented alongside each endpoint.

HTTP status reflects the class: 4xx for caller mistakes, 429 for rate limiting, 503 for provider unavailability, 5xx only for genuine server faults.

## 6. LLM provider integration

### 6.1 Adapter interface

Every provider is a module under `backend/src/providers/`. The shared interface is:

```ts
interface ProviderAdapter {
  readonly id: string;
  readonly models: readonly ProviderModel[];
  call(input: ProviderCallInput, signal: AbortSignal): Promise<ProviderCallOutput>;
}

interface ProviderCallInput {
  modelId: string;
  apiKey: string;
  boardText: string;
  boardPng?: Uint8Array;
  shipsRemaining: readonly string[];
  systemPrompt: string;
  /**
   * Current contiguous count of schema validation failures observed for this run.
   * Incremented after each adjacent schema failure and reset to 0 after a valid
   * model shot. Optional adapter context for provider-side recovery prompts,
   * logging/debugging, and adaptive mitigation; callers must not rely on it
   * being present.
   */
  consecutiveSchemaErrors?: number;
  priorShots: readonly {
    row: number;
    col: number;
    result: "hit" | "miss" | "sunk";
  }[];
  seedDate: string;
}

interface ProviderCallOutput {
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
}
```

- `call` is responsible for exactly one provider round-trip. Parsing, validation, and shot application live in the game loop, not in the adapter.
- `signal` is honored for budget or abort cancellation.
- The adapter never logs the API key, never persists it, and never includes it in the returned object.
- `boardPng` is optional and reserved for the disabled vision-track fallback. The current real-provider path uses `boardText`.

### 6.2 Pricing

Pricing per exact model ID is a compiled constant in `backend/src/pricing/catalog.ts`. Each entry carries input/output rates as integer USD micros per 1M tokens, estimator token counts, `priceSource`, and `lastReviewedAt` (ISO date). Updating an entry requires a PR that bumps `lastReviewedAt` and, if the numbers changed, notes the effective date in the commit message. Cost per call is computed server-side from the adapter's reported token counts at request time by flooring input and output halves independently. This keeps historical cost in `runs.cost_usd_micros` faithful to the pricing in effect when the run happened.

The catalog exposes `estimatedCostRange.minUsd` and `estimatedCostRange.maxUsd` for `GET /api/providers`. The min assumes a 17-shot perfect win; the max assumes the 100-shot cap is reached. Reasoning tokens are not priced twice: provider-reported reasoning tokens are metadata, and only input/output token counts are charged.

### 6.3 Reasoning tokens

When a provider exposes reasoning-token counts (or a separate reasoning output), the adapter reports them in `reasoningTokens` and stores any visible reasoning text in `run_shots.reasoning_text`. When the provider does not, the fields are `null`.

### 6.4 Providers in MVP

- `openrouter` - primary provider; OpenRouter Chat Completions endpoint with a curated model catalog.
- `opencode-go` - OpenCode Go models that expose the OpenAI-compatible chat completions endpoint with `Authorization: Bearer <key>` authentication and no OpenRouter-only `reasoning`/`verbosity` or `response_format` fields, plus an adapter branch for models whose catalog entry opts into the documented Anthropic-style messages endpoint with `x-api-key` authentication.
- `zai` - direct Z.AI Coding Plan provider using the OpenAI-compatible `https://api.z.ai/api/coding/paas/v4/chat/completions` endpoint, `Authorization: Bearer <key>`, and GLM models with `thinking` explicitly enabled.
- `mock` - deterministic, no network calls. Cycles through fixed shot sequences for tests and non-production smoke flows. Used by every CI run.

The originally considered direct `openai`, `anthropic`, and `google` adapters are post-MVP for this slice.

### 6.5 Rate limiting and retries

Retries are confined to a single, narrowly-scoped layer: the adapter's HTTP client retries transient transport faults (network reset, TLS handshake failure, 5xx, 429) with exponential backoff `500 / 1500 / 4500` ms. A 429 honors the provider's `Retry-After` header when present. The game loop itself never retries; it only interprets typed outcomes reported by the adapter. The contract between the loop and the adapter is:

- **Typed `ProviderError { kind: "transient" }`** (5xx after retries, 429 after backoff, TLS, DNS, malformed provider envelope). The run records one `run_shots` row with `result = schema_error`, zero tokens/cost, and redacted `llm_error`, then continues unless the schema-error threshold fires.
- **Per-turn provider timeout.** The engine aborts the provider call when the turn timeout fires, records one `run_shots` row with `result = timeout`, zero tokens/cost, and redacted `llm_error`, then continues unless the same consecutive output-failure threshold fires.
- **Typed `ProviderError { kind: "unreachable" }`** (auth, quota, unsupported model, caller-side provider rejection). The run terminates with `llm_unreachable` without a shot row and without schema-error debt. A wrong user key is not a model failure.
- **Parse or shape failure of a 200 response.** No SSE `error` event (the model did respond, just wrongly). The turn is recorded with `result = schema_error` and counts toward `dnf_schema_errors`.
- **Duplicate or out-of-range cell in an otherwise parse-clean response.** `result = invalid_coordinate` as defined in section 3.5; consumes a turn, does not count toward `dnf_schema_errors`.

**Why count transient missing-output failures but not 4xx auth failures.** From the benchmark's perspective, a missing model output is a missing shot regardless of cause, so transient failures and provider timeouts feed the same DNF threshold honestly while remaining distinguishable at the shot-row level. But a 401 on the user's own key is not the model's fault; smearing it onto the model's schema-error row would slander the model. Separating the two outcomes keeps the leaderboard honest in both directions.

## 7. Frontend

### 7.1 Stack

- Astro 6 for the static shell, routing, and MDX-friendly content.
- Solid.js islands for every interactive region (game view, replay viewer, provider picker, leaderboard filters).
- CSS Modules for component-scoped styles. No global CSS framework in MVP.
- A PWA manifest and a minimal service worker cache only the static shell (HTML / CSS / JS / fonts / icons). All dynamic data (leaderboard, run state, shots, events) is always fetched live. This matches the CLAUDE.md non-goal "offline dynamic data".

### 7.2 Pages

- `/` - leaderboard + today's rendered board. Static HTML with Solid islands hydrated on demand.
- `/play` - provider picker, model picker, API-key field, budget field, start button.
- `/runs/:id` - live game view. Renders the board, opens `EventSource('/api/runs/:id/events')`, updates a Solid signal per shot, and shows live timers plus token/cost counters.
- `/replay/:id` - archived replay. Fetches `/api/runs/:id` and `/api/runs/:id/shots` in parallel, provides playback controls.

### 7.3 Mobile-first layout

- Layouts are authored for portrait 375x812 and up. Desktop gets the same layout constrained to a max-width centered column.
- No horizontal scroll at any supported width.
- Touch targets respect a 44px minimum short edge.

### 7.4 Key handling on the client

- The API-key field is `type=password`, `autocomplete=off`, and never echoed.
- The key is sent once in the body of `POST /api/runs` over HTTPS and is not stored in any client storage (no localStorage, no sessionStorage, no IndexedDB).
- The service worker is configured to never cache `POST` responses and never cache any `/api/runs*` response.

## 8. Testing strategy

### 8.1 Discipline

- TDD is mandatory from milestone S2 onward (see `docs/plan.md`). S1 (bootstrap) permits tests alongside or immediately after the implementation.
- Every affected package must pass `bun test` before a task is considered done.
- A UI-visible change must be validated in a browser against the dev server or staging before the task is considered done.

### 8.2 Database safety in tests

- `backend/tests/setup.ts` asserts that `DATABASE_PATH` is `:memory:`, starts with `/tmp/`, or contains `-test-`. Any other value fails the test suite immediately, before a single query runs.
- Integration tests wrap their body in `withTempDatabase(fn)`, which creates a unique temporary SQLite file under `/tmp/`, applies the schema, invokes the callback, and deletes the file. No test ever touches `project.db` or `project-staging.db`.

### 8.3 Mock provider in CI

- Every CI test uses the `mock` provider. No CI run spends real provider tokens.
- The mock is deterministic: given a seed and a shot index, it returns a fixed response. A dedicated "bad model" variant emits schema errors on request for testing DNF paths.

### 8.4 Test layers

- **Unit** - pure functions (board generator, shot validator, outcome FSM, pricing math).
- **Integration** - Hono endpoints tested via the framework's test client against an in-memory database.
- **E2E** - Playwright smoke suite that exercises the full user flow against **staging only**. Staging runs as a separate systemd service on its own port with `project-staging.db`. Production is never touched by automated tests.

### 8.5 Coverage expectations

- Unit and integration coverage is required for every new module from S2.
- The game loop and provider adapters have integration coverage against the mock provider on both the success path and every terminal outcome in section 4.2.

## 9. Project rules

### 9.1 Secrets

- Provider API keys are user-supplied per run and never persisted. The client never stores them. The server holds them only in the run task's closure and drops them at the terminal state.
- No `.env` file, checked-in or otherwise, contains a production provider key. The only keys in `.env` are infrastructure values (database path, port, log level).
- Backend logs scrub anything that matches a known provider-key prefix before writing, as a defense in depth. The primary defense is simply never logging the key.
- TLS termination happens at Caddy. The backend does not speak plaintext HTTP to the public internet.

### 9.2 Commits

- Conventional Commits for every commit. Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`.
- No Claude co-author trailer unless the user explicitly asks for one.
- Pre-commit hooks are never skipped. If a hook fails, fix the cause; do not pass `--no-verify`.
- `oxlint` and `oxfmt` must pass before a commit is accepted. The pre-commit hook runs both.
- PRs target `main`. Feature work lives on branches. Force-pushing `main` is forbidden.

### 9.3 Attribution

- Every substantive final report or PR description ends with `Skills used: <list>` and `Docs used: <list>` per CLAUDE.md.

### 9.4 Time budgets

- No single wait for a command, build, install, test run, service startup, migration, or log observation may exceed 5 minutes; if still progressing, at most 3 consecutive 5-minute periods for the same operation. Each exceeded period is an investigation trigger (report current blocker, likely causes, probable repairs) per CLAUDE.md.

## 10. Not in the MVP

The following are explicit non-goals for this specification. Any of them landing in the codebase during MVP work is out of scope and should be rejected in review.

- User accounts, registration, login, OAuth, identity federation.
- Docker, containers, Kubernetes, any containerized deployment model.
- Message queues, job brokers, external workers, Redis, background-worker daemons.
- Runs that resume across a server restart.
- Offline dynamic data (leaderboard, runs, shots) in the PWA.
- Web push notifications.
- Multi-tenant infrastructure or per-tenant databases.
- Human-vs-model, model-vs-model live, or any multiplayer mode.
- Provider-abstraction layers that try to paper over provider differences beyond the thin adapter in section 6.1.
- Provider structured-output modes, JSON-schema decoders, or tool-calling modes (rule from section 3.4).
- Stored API keys in any form, on any tier of storage.
- Training-data export or fine-tuning corpus production.
- Monetization, prizes, wagers, paid tiers, affiliate tracking.
- Retention / pruning of historical runs.
