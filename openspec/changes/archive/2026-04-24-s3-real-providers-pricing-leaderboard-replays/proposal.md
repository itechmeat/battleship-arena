## Why

S2 shipped a full game loop against a mock provider, but BattleShipArena is only useful to visitors the moment a real API key runs a real model. S3 makes that possible: two real provider adapters (OpenRouter and opencode-go), per-model pricing with a budget cap that can terminate a run, a leaderboard and home page that show live results, and a replay viewer that plays back any archived run. The scope is narrowed from the original provider list in `docs/spec.md` section 6.4 to the two MVP providers agreed in the brainstorm; the remaining four (`openai`, `anthropic`, `google`, `zai`) remain post-MVP.

## What Changes

- Introduce the provider-integration layer: shared retry-aware HTTP client with injected `fetch`, image-encoding helpers, typed `ProviderError` discriminated union, and OpenRouter + opencode-go adapters that honor spec section 6.5's retry and error-class rules.
- Introduce the pricing module (`backend/src/providers/pricing.ts`) with a compiled per-exact-model-ID `PRICING_TABLE`, integer-micros cost math, and estimators that power the Start-button cost range.
- Introduce the `dnf_budget` terminal outcome with post-hoc enforcement, wired through the outcome FSM and the engine; `budget_usd_micros = 0` is persisted as NULL (no cap).
- Add `GET /api/providers` returning grouped providers with pricing, estimators, `estimatedCostRange`, `priceSource`, `lastReviewedAt`, `Cache-Control: public, max-age=60`, and `ETag`.
- Add `GET /api/leaderboard?scope=today|all&providerId?=&modelId?=` with session-dedup, `(provider_id, model_id)` partitioning, and classical TypeScript median for the all-time scope.
- Add `GET /api/board?date=YYYY-MM-DD` returning the PNG for any past or present UTC seed; future dates and malformed dates return `invalid_input`.
- Rewrite the home page as an Astro stack with an inlined SVG empty-board preview plus a Solid `Leaderboard` island with scope toggle, provider filter, model filter, and best-run replay links.
- Replace the hardcoded mock-only picker on `/play` with real provider options fetched from `/api/providers`; staging builds still inject the `mock` option for Playwright smoke.
- Surface `estimatedCostRange` and a reasoning caveat on the `/play` Start button; make the budget field truly optional (empty or `0` means no cap).
- Add the `/runs/:id/replay` page, the pure `replayReducer`, and the `ReplayPlayer` island with uniform-tick playback at 1x/2x/4x speeds.
- Extend the Playwright smoke with three new scenarios (mock budget DNF, leaderboard, replay) plus a staging-only `?mockCost=` URL knob that lets the mock return a synthetic per-turn cost.
- Add the manually-triggered real-token smoke script (`backend/scripts/smoke-real-keys.ts`) that parses shots, advances game state, and stops on terminal outcome; ship a short `docs/ops/real-token-smoke.md` runbook. Never called from CI.
- Map `ProviderError { kind: "transient" }` to `schema_error` turns and `ProviderError { kind: "unreachable" }` to the `llm_unreachable` outcome per spec section 6.5.
- **BREAKING**: `POST /api/runs` now accepts `budgetUsd = 0` and persists it as NULL (no cap). Callers that relied on `0` being rejected as `invalid_input` will silently succeed. Negative values continue to reject.

## Capabilities

### New Capabilities

- `real-providers`: two real provider adapters (OpenRouter, opencode-go) plus the shared HTTP client, image-encoding helpers, `ProviderError` discriminated union, and provider-registry assembly that host them.
- `pricing`: per-exact-model-ID `PRICING_TABLE`, integer-micros cost math, and estimator math used by both the engine (for `cost_usd_micros`) and `GET /api/providers` (for `estimatedCostRange`).
- `providers-catalog`: `GET /api/providers` endpoint surfacing pricing, estimators, cost range, source, review date; ETag + 60 s cache; staging-only mock injection happens on the web client, not on this endpoint.
- `leaderboard`: session-dedup'd SQL queries and `GET /api/leaderboard?scope=today|all` endpoint plus the Solid `Leaderboard` island with scope toggle, provider/model filters, and best-run replay links.
- `board-preview`: `GET /api/board?date=YYYY-MM-DD` PNG endpoint with immutable caching for past dates and `no-cache` for today, `ETag` support, and explicit `invalid_input` rejection of future or malformed dates.
- `home-page`: Astro home page with inline SVG empty-board preview and the `Leaderboard` island mounted as `client:load`.
- `replay-viewer`: `/runs/:id/replay` page, pure `replayReducer`, and `ReplayPlayer` island with uniform-tick playback at 1x/2x/4x speeds and scrubber-driven seeking.
- `real-token-smoke`: `backend/scripts/smoke-real-keys.ts` CLI, excluded from CI, plus `docs/ops/real-token-smoke.md` runbook.

### Modified Capabilities

- `run-lifecycle`: add the `dnf_budget` terminal outcome and per-turn cost accumulation; fix the evaluation order (won > dnf_shot_cap > dnf_schema_errors > dnf_budget); map `ProviderError { kind: "transient" }` to a `schema_error` turn and `ProviderError { kind: "unreachable" }` to the `llm_unreachable` outcome per spec section 6.5.
- `runs-api`: `POST /api/runs` now accepts `budgetUsd = 0` and persists it as NULL; negative values still reject with `invalid_input`; the `/play` picker is now populated from `GET /api/providers` instead of hardcoded mock options; a staging-only `mockCost` body field is accepted when `providerId === "mock"` and ignored otherwise.
- `mock-provider`: grow a test-only `testHooks` options bag (`costUsdMicros`, `tokensIn`, `tokensOut`, `reasoningTokens`, `failure: "transient" | "unreachable" | null`) used exclusively by integration tests and the staging mock-cost knob. Production registration ignores the hooks.
- `shared-contract`: add `ProviderError` (discriminated union), `ProvidersResponse` (+ nested `ProvidersResponseProvider`, `ProvidersResponseModel`), and `LeaderboardResponse` (+ nested `LeaderboardRow`). No changes to existing exported types.

## Impact

- **Backend code**: new modules `backend/src/providers/{http-client,image-encoding,openrouter,opencode-go,index,pricing}.ts`; new routes `backend/src/api/{providers,board,leaderboard}.ts`; new script `backend/scripts/smoke-real-keys.ts`. Modified modules: `backend/src/runs/{outcome,engine}.ts`, `backend/src/providers/{types,mock}.ts`, `backend/src/api/runs.ts`, `backend/src/app.ts`.
- **Web code**: new Astro components `web/src/components/TodayBoardSvg.astro`, new page `web/src/pages/runs/[id]/replay.astro`, new islands `web/src/islands/{Leaderboard,ReplayPlayer,replayReducer}.tsx`. Modified: `web/src/pages/index.astro`, `web/src/islands/StartRunForm.tsx`, `web/src/lib/api.ts`.
- **Shared code**: new types in `shared/src/types.ts` (`ProviderError`, `ProvidersResponse`, `ProvidersResponseProvider`, `ProvidersResponseModel`, `LeaderboardResponse`, `LeaderboardRow`).
- **Tests**: new unit tests for pricing, HTTP client, image-encoding, replayReducer; new contract tests per provider under `backend/tests/integration/providers/`; new integration tests for the providers, board, and leaderboard endpoints; extended engine tests for `dnf_budget` and `ProviderError` mapping; extended outcome-FSM tests; extended Playwright smoke on staging.
- **Database**: no new tables. `run_shots` may need a new `llm_error` column (Drizzle migration) if it does not already exist; the engine populates it when a transient provider error becomes a `schema_error` turn.
- **CI**: no new workflows; `pr.yml` and `deploy-staging.yml` pick up the extended tests automatically.
- **Ops**: one new runbook at `docs/ops/real-token-smoke.md`; one new script under `backend/scripts/` excluded from CI by location.
- **Documentation**: `docs/spec.md` section 6.4 updated to list the two MVP providers with the other three relegated to a named post-MVP bullet; `docs/plan.md` section 3 S3 checklist and section 6.5 task list reduced to two adapter implementation tasks.
- **External dependencies**: none added. Adapter HTTP calls use `globalThis.fetch`; the HTTP client is a local module with zero imports beyond the standard library.
- **Non-goals reaffirmed**: no new SQLite tables, no materialized leaderboard, no background workers, no service-worker cache changes, no auth, no framework-level AI SDKs.
