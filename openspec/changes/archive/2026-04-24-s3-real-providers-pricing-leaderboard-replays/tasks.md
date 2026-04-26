## 1. Documentation prep

- [x] 1.1 Resolve the opencode-go slug spelling, endpoint, auth scheme, and model catalog with the product owner
- [x] 1.2 Update `docs/spec.md` section 6.4 to the two-provider MVP list and relegate the other three slugs to a post-MVP bullet
- [x] 1.3 Update `docs/plan.md` section 3 S3 checklist and section 6.5 task list to reflect the two-adapter scope

## 2. Shared contract

- [x] 2.1 Add `ProviderError` discriminated union to `shared/src/types.ts` with type tests
- [x] 2.2 Add `ProvidersResponse`, `ProvidersResponseProvider`, `ProvidersResponseModel` with type tests
- [x] 2.3 Add `LeaderboardResponse` and `LeaderboardRow` with type tests

## 3. Pricing module

- [x] 3.1 Define the `PricingEntry` shape and empty `PRICING_TABLE` scaffold
- [x] 3.2 Implement `getPricingEntry` and `listPricedModels` with unit tests
- [x] 3.3 Implement `computeCostMicros` with floor-rounding per half and unit tests
- [x] 3.4 Implement `estimateCostRangeMicros` with unit tests

## 4. Provider plumbing

- [x] 4.1 Build the shared HTTP client with injected fetch, 500/1500/4500 ms backoff, `Retry-After` cap at 30 s, and `NonRetriable4xxError` / `TransientFailureError` classes
- [x] 4.2 Add image-encoding helpers with unit tests
- [x] 4.3 Extend `providers/types.ts` to document the `ProviderError` re-throw contract
- [x] 4.4 Extend the mock adapter with the `testHooks` options bag (cost, tokens, reasoning, failure kind)

## 5. Contract test harness

- [ ] 5.1 Create `loadFixture`, `buildFetch`, `assertRequest`, and `redact` helpers in the integration provider harness
- [ ] 5.2 Cover every harness helper with unit tests

## 6. OpenRouter adapter

- [ ] 6.1 Capture redacted OpenRouter fixtures for happy, schema-error, token-edge, auth-401, rate-limited-429, transient-5xx, and reasoning-response cases
- [x] 6.2 Populate `PRICING_TABLE` rows for the OpenRouter model catalog with `priceSource` and `lastReviewedAt`
- [x] 6.3 Implement the OpenRouter adapter, catching transport errors and re-throwing `ProviderError`
- [x] 6.4 Verify the full contract-test suite passes for the OpenRouter adapter

## 7. opencode-go adapter

- [x] 7.1 Confirm the Phase 1 resolution from group 1 still holds before capturing fixtures
- [ ] 7.2 Capture redacted opencode-go fixtures covering the same scenario set as OpenRouter
- [x] 7.3 Populate `PRICING_TABLE` rows for the opencode-go model catalog
- [x] 7.4 Implement the opencode-go adapter mirroring the OpenRouter error-handling pattern
- [x] 7.5 Verify the full contract-test suite passes for the opencode-go adapter

## 8. Provider registry

- [x] 8.1 Assemble `providers/index.ts` exporting the three adapter ids and wire it into `app.ts`
- [x] 8.2 Add a registry integration test asserting the three expected adapter ids are available

## 9. Budget DNF

- [x] 9.1 Extend `RunLoopState` with `accumulatedCostMicros` and thread `costUsdMicros` through every engine event variant
- [x] 9.2 Add the `dnf_budget` transition to `reduceOutcome` with the priority `won > dnf_shot_cap > dnf_schema_errors > dnf_budget`
- [x] 9.3 Persist `runs.cost_usd_micros` at every terminal state with integration coverage

## 10. Provider-error handling in the engine

- [x] 10.1 Map `ProviderError { kind: "transient" }` to a `schema_error` turn and ensure the `dnf_schema_errors` counter advances
- [x] 10.2 Map `ProviderError { kind: "unreachable" }` to the `llm_unreachable` outcome without touching schema-error counters
- [x] 10.3 Add the `run_shots.llm_error` Drizzle migration if the column is missing and populate it on transient errors

## 11. `POST /api/runs` budget semantics

- [x] 11.1 Accept `budgetUsd = 0` and persist it as NULL
- [x] 11.2 Treat absent or null `budgetUsd` as no cap
- [x] 11.3 Reject negative `budgetUsd` with `invalid_input` and cover every case with integration tests

## 12. `GET /api/providers`

- [x] 12.1 Create the providers route serialising USD decimals (not micros) with `estimatedCostRange`, `priceSource`, and `lastReviewedAt`
- [x] 12.2 Add `Cache-Control: public, max-age=60`, `ETag`, and 304 support
- [x] 12.3 Mount the route in `app.ts` and cover behaviour with integration tests

## 13. `GET /api/board`

- [x] 13.1 Create the board route validating dates and rejecting future or malformed values with `invalid_input`
- [x] 13.2 Set `immutable` caching for explicit past dates and `no-cache` for today, with `ETag` and 304 support
- [x] 13.3 Mount the route in `app.ts` and cover behaviour with integration tests

## 14. Leaderboard SQL

- [ ] 14.1 Implement `leaderboardToday` as a single statement with session-dedup CTE partitioned on `(client_session, provider_id, model_id, seed_date)`
- [ ] 14.2 Implement `leaderboardAllWins` returning session-deduped wins across all seeds partitioned on `(client_session, provider_id, model_id)`
- [x] 14.3 Cover both queries with integration tests over seeded fixture data

## 15. `GET /api/leaderboard` endpoint

- [x] 15.1 Implement scope validation plus provider and model filters
- [x] 15.2 Compute the all-time median in TypeScript with stable ordering (median asc, runsCount desc, displayName asc)
- [x] 15.3 Set `Cache-Control: no-store` and cover behaviour with integration tests

## 16. Shared web API helpers

- [x] 16.1 Add typed `getProviders()` and `getLeaderboard()` wrappers to `web/src/lib/api.ts` while keeping existing helper signatures intact

## 17. Home page and Leaderboard island

- [x] 17.1 Create the Leaderboard island stub so index.astro imports resolve
- [x] 17.2 Rewrite `index.astro` with the header, inline SVG `TodayBoardSvg`, and Leaderboard section
- [ ] 17.3 Build the full Leaderboard island with scope toggle, provider and model selects, AbortController-managed fetches, and empty/error/loading states
- [x] 17.4 Render the leaderboard table with replay links for the today scope

## 18. `/play` provider picker from API

- [x] 18.1 Replace the hardcoded mock-only picker in `StartRunForm.tsx` with provider data from `/api/providers`
- [x] 18.2 Inject the mock entry only when `import.meta.env.MODE` is `staging`, `development`, or `test`, and clear `modelId` on provider change

## 19. `/play` Start button caption and optional budget

- [x] 19.1 Surface `estimatedCostRange` and the "Reasoning models may cost more" note on the Start button
- [x] 19.2 Make the budget field optional so empty or `0` submits as absent

## 20. Replay reducer

- [x] 20.1 Implement the pure `replayReducer` with `loading`, `idle`, `playing`, `done`, and `error` states
- [x] 20.2 Implement every action (`play`, `pause`, `tick`, `seek`, `stepForward`, `stepBack`, `speed`, `loaded`, `loadFailed`) with unit coverage

## 21. Replay viewer island and page

- [x] 21.1 Build `ReplayPlayer.tsx` on top of the reducer, reusing `BoardView` with shots-only props and the existing run helpers
- [x] 21.2 Drive playback with a Solid effect that sets `setInterval` to `round(800 / speed)` ms
- [x] 21.3 Create `web/src/pages/runs/[id]/replay.astro` mounting the island

## 22. Staging-only mock-cost knob

- [x] 22.1 Forward the `?mockCost=` URL parameter from the staging web build into the `POST /api/runs` body
- [x] 22.2 Honour the parameter on the staging mock adapter and strip it from production builds

## 23. Playwright smoke scenarios

- [ ] 23.1 Add the shared `web/tests/e2e/helpers/run.ts` helper module
- [ ] 23.2 Add the mock budget DNF scenario end-to-end
- [ ] 23.3 Add the leaderboard surface scenario end-to-end
- [ ] 23.4 Add the replay playback scenario end-to-end

## 24. Manual real-token smoke CLI

- [x] 24.1 Implement `backend/scripts/smoke-real-keys.ts` with the full flag surface (`--provider`, `--all`, `--key`, per-provider key flags, `--model`, `--turns`, `--budget`, `--dry-run`, `--force-prod`)
- [x] 24.2 Parse each response via the shared `parseShot`, resolve against `generateBoard`, and advance `priorShots` turn over turn
- [x] 24.3 Stop on any terminal outcome and emit per-turn JSON plus a summary JSON with the API key redacted

## 25. Ops runbook

- [x] 25.1 Write `docs/ops/real-token-smoke.md` covering when and how to run the smoke and what to paste into PR descriptions

## 26. Final verification

- [x] 26.1 Run `bun test` in every workspace and `bun run --cwd web build`
- [ ] 26.2 Run `bun run --cwd web test:e2e` against staging
- [ ] 26.3 Deploy to staging via `deploy-staging.yml` and run the real-token smoke against both MVP providers
- [ ] 26.4 Paste the smoke summary JSON into the merge PR and tick every S3 checklist item in `docs/plan.md` section 3
