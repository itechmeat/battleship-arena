## Context

S2 shipped a complete Battleship game loop against the mock provider: deterministic seed-per-day boards, run lifecycle, SSE live view, and a working `/play` page. The product is observable but not yet useful, because no real model has ever played a real game on it. S3 closes that gap. See `proposal.md` for the change-level motivation; this document records the architectural choices behind the work.

The brainstorm narrowed scope from the five providers in `docs/spec.md` section 6.4 to two MVP providers (`openrouter`, `opencode-go`). The other three slugs (`openai`, `anthropic`, `google`, `zai`) are deliberately deferred to post-MVP follow-ups that will reuse the same adapter pattern. The narrowing is a product decision, not a spec constraint, so `docs/spec.md` and `docs/plan.md` are updated in the same PR that lands this design.

Authoritative inputs: `docs/spec.md` (wire contracts, FSM, retry rules), `docs/architecture.md` (module boundaries, leaderboard partitioning), `docs/plan.md` (S3 acceptance criteria), `CLAUDE.md` and `AGENTS.md` (project guard rails: April 2026 date discipline, Bun 1.3.12+, Hono 4.12.14+, Drizzle 0.45.2+, TypeScript 6.0.2+, Astro 6.1.7+, Solid 1.9.12+, Playwright 1.59.1+, oxlint/oxfmt, single-host deploy behind Caddy, no Docker, no real tokens in CI). Stakeholders: the operator who pastes a key into `/play`, the reviewer who needs the leaderboard to be honest, and future adapter authors who will copy this story's pattern.

## Goals / Non-Goals

**Goals:**

- Two real provider adapters (`openrouter`, `opencode-go`) that obey the spec's retry/error model and ship with contract tests against captured redacted fixtures.
- A pricing module that owns every dollar value: integer-micros cost math, per-model estimators, and a maintenance discipline that keeps the table honest (`priceSource`, `lastReviewedAt`).
- A `dnf_budget` terminal outcome wired through the outcome FSM and the engine, exercised end-to-end against the mock with a synthetic per-turn cost.
- Three new HTTP endpoints (`GET /api/providers`, `GET /api/leaderboard?scope=today|all`, `GET /api/board?date=YYYY-MM-DD`) with spec-aligned caching headers and typed shared contracts.
- A home page that shows today's empty board plus a filterable leaderboard, and a `/runs/:id/replay` viewer with 1x/2x/4x uniform-tick playback.
- An extended Playwright smoke (mock win, mock budget DNF, leaderboard surface, replay) running on staging.
- A scripted, never-CI manual real-token smoke that proves "the live upstream still accepts our request shape" on human demand.

**Non-Goals:**

- The other four provider slugs (`openai`, `anthropic`, `google`, `zai`). The spec keeps them as the long-term roadmap; each ships in its own follow-up story, not in S4.
- Seed rollover testing, maintenance modes, `aborted_server_restart` reconciliation, backup drill, and the production cutover (all S4).
- Any CI run that spends real provider tokens. Money safety is load-bearing; the manual smoke stays outside `bun test` by design.
- New SQLite tables, materialised leaderboards, TTL caches, background workers, queues, or service-worker cache changes.
- Framework-level AI SDKs. Each adapter does its own HTTP call so the benchmark stays honest about per-provider error shapes.
- Any abstraction over `ProviderAdapter` beyond the thin interface in spec section 6.1.

## Decisions

**Two providers in MVP-S3, broad model catalog within each.** Considered (A) the spec's full five-provider list and (B) shipping one provider as a pilot. Chose two because shipping five well multiplies fixture work, pricing maintenance, and upstream-drift exposure with no proportional user gain, while one provider would understate the leaderboard's value. Within those two, a broad model catalog (5+ priced models per provider) is preferred over a minimum floor: OpenRouter alone fans out to multiple foundation-model families, so "two providers" does not mean "two model families on the leaderboard". The pricing-PR cadence cost is accepted deliberately and absorbed by the `lastReviewedAt` discipline. Specific model IDs are intentionally not pinned in this document - they are captured against each provider's live pricing page on the day of capture, so April-2026 stale knowledge does not bake into a doc that will outlive the capture task.

**Post-hoc budget enforcement.** Considered (B) predictive enforcement using the pricing estimators and (C) a hybrid predictive-then-post-hoc safety net. Chose post-hoc because the benchmark exists to measure actual provider behaviour, including overshoot. Predictive enforcement would couple the `dnf_budget` rate to estimator calibration quality instead of real spend; reasoning-token variability is exactly the differentiator the leaderboard is designed to surface. "Overshoot by one turn" is also how real-world API caps behave at OpenAI and Anthropic, so users will not be surprised. Because `dnf_budget` never feeds the leaderboard (`won` only, per spec section 4.5), the overshoot has no leaderboard-honesty impact.

**Budget input optional, with `0` and empty both meaning "no cap".** Considered (A) required-no-default and (B) required-pre-filled-with-`estimatedCostRange.max`. Chose optional because spec section 5.1 already makes `budget_usd_micros` nullable, the Start-button caption already surfaces the estimated cost range as information, and pre-filling imposes a first-use tax on casual users. The Start button still shows the range; the budget input simply does not insist on it. Negative values continue to reject as `invalid_input`. This is the BREAKING change called out in `proposal.md` (`POST /api/runs` now silently accepts `budgetUsd = 0`).

**Engine error-mapping via a discriminated `ProviderError` union.** Considered throwing the HTTP client's internal classes (`TransientFailureError`, `NonRetriable4xxError`) all the way to the engine. Rejected because that leaks transport-layer types into engine code and makes "what's a `transient` error?" a question the engine has to answer twice. The HTTP client throws those internal classes; each adapter catches and re-throws the shared `ProviderError = { kind: "transient" | "unreachable", cause }`; the engine branches on `kind`. Per spec section 6.5: `transient` becomes a `schema_error` turn (which feeds the `dnf_schema_errors` counter); `unreachable` becomes the `llm_unreachable` outcome immediately.

**Fetch injection for contract tests.** Considered MSW and `nock`. Rejected both because they add a dependency, an extra layer of "did the interceptor survive Bun's test reset" flake, and configuration overhead for the same observable behaviour as a one-line stub. Each adapter takes `fetch` as a dependency; tests inject a canned responder built from on-disk fixture JSON. The harness is roughly 60 lines of TypeScript and has zero `node:net` or `undici` imports.

**Compute-on-read leaderboard with classical median in TypeScript.** Considered a materialised leaderboard table refreshed on run terminal-state, and a TTL cache fronting the SQL. Rejected materialisation because volumes are tiny and invalidation bugs are real; rejected the TTL cache because UTC-rollover staleness at 23:59 -> 00:01 is a worse failure mode than a fresh query on filter change. The all-time median cannot be expressed in pure SQL (SQLite has no percentile function), so the handler reads session-deduped wins and computes a classical median (mean of two middles for even-N) in TypeScript. Tie-break: median asc, then `runsCount` desc, then `displayName` asc.

**Leaderboard partitioning by `(client_session, provider_id, model_id)`.** Considered `(client_session, model_id)` alone. Rejected because two different providers can offer the same raw `model_id`; collapsing them onto a single leaderboard row would silently mis-attribute results. The chosen partition matches `AGENTS.md`'s "leaderboard by `(providerId, modelId)`" rule and preserves provenance.

**Inline SVG empty board on the home page.** Considered `<img src="/api/board">`. Rejected because an empty board carries no ship positions, needs no network round trip, scales crisply on Retina, and avoids a pointless cache-hit dependency on first paint. `/api/board` still ships in this story (the replay page reads it for archived seed dates and the product's external-verifiability story justifies it).

**Uniform-tick replay (`Math.round(800 / speed)` ms).** Considered (B) original wall-clock playback and (C) a hybrid with capped gaps. Rejected wall-clock because original per-turn durations are model artefacts that do not inform the human watching the replay - they create awkward stalls and confuse "1x" with "the model's actual thinking time". A "playback" caption next to the speed toggle reinforces the framing. The replay reducer is pure (unit-tested) and the `setInterval` is a Solid effect inside the island, not in the reducer.

**System prompt lives in `backend/src/runs/prompt.ts`.** The prompt is an engine concern, never serialised over the wire, and never crossed between backend and web. `shared/` stays reserved for types that genuinely cross the process boundary; putting the prompt there would create a false import edge.

**Mock adapter grows a test-only `testHooks` options bag.** Considered a parallel "mock-with-cost" adapter and a Vitest-only patch. Rejected the parallel adapter for adding two registry codepaths to maintain; rejected the patch because the staging Playwright smoke also needs to drive the mock with a synthetic per-turn cost. The hooks (`costUsdMicros`, `tokensIn`, `tokensOut`, `reasoningTokens`, `failure: "transient" | "unreachable" | null`) are honoured only when the staging build is active; production registration ignores them.

**Staging-only `?mockCost=` URL knob (no dedicated test endpoint).** Considered adding `POST /api/test/mock-run`. Rejected because it widens the API surface for a single test scenario and creates prod-vs-staging drift risk. A query parameter that the staging web build forwards into the `POST /api/runs` body (gated by `import.meta.env.MODE === "staging"`) keeps the production API clean while letting Playwright drive the budget DNF scenario.

**Home page layout: vertical stack at every width.** Considered side-by-side (board left, leaderboard right) at desktop widths. Rejected because `docs/architecture.md` section 7.3 already specifies a mobile-first stack and the desktop view is the same stack inside a max-width column. One layout, one set of test screenshots, no responsive bug class.

**Manual real-token smoke is a script outside `bun test`.** Considered a `bun test` target gated by env-var presence. Rejected because a developer runs `bun test` hundreds of times a week; a single accidental run with real env vars would spend money. The closed-CI promise in spec section 8.3 is load-bearing for the project's money-safety story. A separate file that CI never calls is the only design that preserves that promise. The script parses the model's shot using the same parser the engine uses, advances the game state via `board/generator` and `board/renderer` so multi-turn runs are real, supports `--all` and per-provider key flags, refuses to run against production without `--force-prod`, and writes only to `:memory:`/`/tmp/*`/`*-test-*` databases.

**FSM evaluation order: `won` > `dnf_shot_cap` > `dnf_schema_errors` > `dnf_budget`.** Documented inside the `outcome` module. Two simultaneous-terminal cases are explicitly tested: a turn that wins and crosses the budget resolves to `won`; a turn that hits the fifth consecutive schema error and crosses the budget resolves to `dnf_schema_errors`. Without a documented order these would be silent races.

## Risks / Trade-offs

- [Upstream provider response drift] -> Per-provider contract tests in CI surface any change as a red build; fixture refresh becomes a focused PR that bumps `lastReviewedAt`, and the manual real-token smoke (Section 4.11 of the source design) is the human-driven canary that catches drift the contract tests cannot, because they only know the captured shape.
- [Pricing-table staleness] -> Two layers of defence: the `lastReviewedAt` discipline plus an ETag regression test on `/api/providers` that catches "table edited without bump", and the manual real-token smoke run before every pricing-table PR to validate that the current estimators are still close to reality.
- [Budget overshoot surprises a user] -> The run's terminal row carries actual `cost_usd_micros` and `budget_usd_micros`, so the gap is always inspectable. No additional UI copy is added because the overshoot is the spec-aligned behaviour and matches how organisation caps work at major providers; copy would invite churn over a deliberate decision.
- [Leaderboard false parity from a single lucky run] -> `runsCount` is shown on every row and ties break on `runsCount desc`. The home page surfaces the count explicitly rather than hiding it.
- [Replay cadence mistaken for the model's real thinking time] -> "playback" caption adjacent to the speed toggle. The uniform-tick decision is the root cause; the caption is the cheapest mitigation that does not re-open the wall-clock debate.
- [`opencode-go` slug, endpoint, auth scheme, and model catalog unresolved at design time] -> The implementation plan opens with a blocker task (Phase 0) that resolves the slug spelling with the product owner and captures the upstream contract before any spec-and-adapter work proceeds. If the resolution materially changes the adapter shape, this design is updated rather than worked around.
- [Agent git policy conflict] -> `AGENTS.md` prohibits `git add`/`git commit` without explicit user permission, while project TDD discipline expects a commit per green test. Resolved by treating every commit step in the implementation plan as an explicit user-approval checkpoint; the plan's preamble documents this. No design change required, but the constraint is recorded so future agents do not silently auto-commit.

## Migration Plan

- **Database.** No new tables. The only potential migration is adding `run_shots.llm_error` if the column is not already present; the engine populates it when a transient provider error becomes a `schema_error` turn. Confirm against the current Drizzle schema; add the migration in this story if absent.
- **Wire contract.** `POST /api/runs` budget semantics relax: `budgetUsd = 0` now persists as `NULL` instead of rejecting. This is a BREAKING change called out in `proposal.md`; existing callers that relied on `0` rejecting will silently succeed.
- **Deployment.** Standard `deploy-staging.yml` on merge. No production cutover in this story; production cutover is S4. The staging service uses its own SQLite file (`project-staging.db`) per `CLAUDE.md`'s testing rules.
- **Rollback.** Revert the merge and redeploy staging. No data shape changes that would block rollback - the optional `run_shots.llm_error` column is nullable and ignored by older code paths; pre-S3 runs continue to render in the leaderboard and replay viewer because both surfaces read existing columns only.

## Open Questions

- The exact `opencode-go` slug spelling (the brainstorm transcript used "opencode go"), endpoint URL, auth scheme, request/response shapes, and model catalog. Tracked as Phase 0 of the implementation plan; resolved before Phase 1 begins.
- Whether `shared/src/shot-schema.ts` already exports a `parseShot` helper. If yes, the manual real-token smoke imports it and the engine continues to be the single source of truth. If no, the helper is added in Phase 1 rather than letting the smoke script fork the parsing logic.
