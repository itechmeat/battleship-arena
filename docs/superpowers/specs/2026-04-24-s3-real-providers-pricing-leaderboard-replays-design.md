# S3 design: real providers, pricing, budget, leaderboard, replays

- Date: 2026-04-24 (UTC)
- Story: S3 (see `docs/plan.md` section 6)
- Status: draft, awaiting author review
- Scope authorities: `docs/spec.md`, `docs/architecture.md`, `docs/plan.md`, `CLAUDE.md`
- Predecessor story: S2 (game loop against the mock provider, merged)

This document is the brainstormed design for story S3. It does not replace `docs/spec.md`; it chooses among the alternatives the spec leaves open, and records the reasoning behind each choice so the implementation plan inherits that context.

## 1. Scope and non-goals

In scope for S3:

- Two real provider adapters for MVP S3: `openrouter` and `opencode-go`. Each ships with contract tests against captured redacted fixtures.
- A manually-triggered real-token smoke suite that exercises each of the two adapters against real provider keys, intentionally excluded from CI (see Section 4.11). It is automated in the sense of "scripted and repeatable", not in the sense of "runs without a human".
- `providers/pricing.ts`: per-exact-model-id table and cost/estimator math.
- `dnf_budget` terminal outcome, wired through the engine and exercised against the mock.
- `GET /api/providers`, `GET /api/leaderboard?scope=today|all`, `GET /api/board?date=YYYY-MM-DD`.
- Home page: today's board preview plus a filterable leaderboard.
- `/runs/:id/replay` archive viewer with 1x/2x/4x playback and a playhead.
- Extended Playwright smoke on staging covering the four scenarios from `plan.md` section 6.5 task 14.

Out of scope for S3 even though tempting:

- The other three providers listed in `docs/spec.md` section 6.4 (`openai`, `anthropic`, `google`, `zai`). The spec's list stays as the long-term roadmap; each of those ships in its own follow-up story via the same adapter pattern S3 builds out. They are not S4 work either; they are post-MVP.
- Seed rollover tests, maintenance modes, `aborted_server_restart` reconciliation, backup drill, production deploy (all S4).
- Any CI run that spends real provider tokens (never). The real-token smoke is run-by-hand only.
- Any abstraction over `ProviderAdapter` beyond the thin interface in spec section 6.1 (explicit non-goal in spec section 10).
- Framework-level AI SDKs; each adapter does its own HTTP call because that is the only way the benchmark stays honest about per-provider error shapes.

Not introduced in this story:

- No new SQLite tables. No materialized leaderboard. No new cookie beyond what S2 issues. No service-worker cache changes. No background workers or queues.

## 2. Decisions taken without asking

These follow straight from the spec, the plan, or dominant-strategy considerations. They are recorded here with reasoning so the later plan and reviewers can audit them.

1. **Pricing module shape.** Single file `backend/src/providers/pricing.ts` with a hardcoded `PRICING_TABLE` keyed by exact `(providerId, modelId)`; each row carries input/output rates (integer micros per 1M tokens), the three estimators, `priceSource`, and `lastReviewedAt`. Rationale: spec section 6.2 dictates shape and maintenance discipline; a compile-time constant avoids a new table and keeps historical cost faithful to the prices in effect when a run happened.
2. **Leaderboard compute-on-read.** SQL over `runs` with window functions for dedup; median computed in TypeScript. No materialized table, no cache with TTL. Rationale: volumes are tiny; compute-on-read has no invalidation bugs.
3. **Contract-test stubbing via fetch injection.** Each adapter receives `fetch` as a dependency; tests pass a canned responder that replays fixture JSON from disk. Rationale: no extra dependency (no MSW, no nock), deterministic, no "did the interceptor survive Bun's test reset" flake class.
4. **System prompt lives in `backend/src/runs/prompt.ts`.** Engine-only concern; not part of the wire contract; `shared/` is reserved for types crossing backend/web.
5. **Home page layout.** Vertical stack at every width: header, today's board preview, leaderboard. Desktop is the same stack constrained to a max-width column (spec section 7.3).
6. **Today's board preview is an inlined SVG, not a PNG from `/api/board`.** An empty grid leaks no ship positions and needs no network round trip; the `shared/board-svg` helper reused from S2 keeps the home preview visually consistent with the live view.
7. **Leaderboard filters re-fetch server-side.** Each filter change issues a fresh `/api/leaderboard` call. The API stays the source of truth; the response is tiny.
8. **Replay uses a uniform tick, not original wall-clock.** `800 / speed` ms per advance. Original per-turn durations do not inform the viewer and cause awkward stalls.
9. **Mock adapter grows a test-only options bag** (`costUsdMicros`, failure-mode flags) so integration tests can exercise the budget DNF and adapter-error paths without real network. Production mock entry ignores these options.

## 3. Questions answered

Each question was presented to the author with 2-3 options and a recommendation. The chosen answer is recorded with the reasoning.

### Q1. Model catalog breadth per provider

- **A.** Minimum floor (1 per provider, 5 total).
- **B.** Representative set (2-3 per provider, ~12-14 total). Recommended.
- **C.** Broad catalog (5+ per provider, 25+ total).

**Chosen: C.** Broad catalog within the two MVP-S3 providers (`openrouter` and `opencode-go`). The spec does not pin specific model IDs; the design describes the shape (pricing row + estimators + per-provider fixtures) and delegates the actual catalog to a "capture current vision catalog" task per provider in the S3 implementation plan. Model IDs must be verified against each provider's live pricing page on the day of capture. OpenRouter's slot is explicitly a curated multi-model subset drawn from the live catalog on capture day; `opencode-go`'s exact upstream endpoint and model list are also captured on that day.

Reasoning kept on record:

- Broader catalog within each shipped provider makes the leaderboard interesting from day one and matches the product framing in `docs/about.md`.
- Pinning model IDs in this spec would bake April-2026 stale knowledge into a document that will outlive the capture task.
- The pricing-PR cadence cost is accepted deliberately; the `priceSource` + `lastReviewedAt` discipline in spec section 6.2 already absorbs it.
- Pre-approved examples from the brainstorming session were not carried forward because the author called them out as stale; the spec intentionally keeps the catalog as a capture-day responsibility.

### Q1.1. Which providers ship in MVP S3?

Decided outside the original Q1 question after the spec was drafted.

- **A.** All five providers listed in `docs/spec.md` section 6.4 (`openrouter`, `openai`, `anthropic`, `google`, `zai`).
- **B.** Two providers only: `openrouter` and `opencode-go`. Chosen.

**Chosen: B.** S3 ships `openrouter` and `opencode-go`. The other three slugs in spec section 6.4 become post-MVP add-ons, each delivered in its own follow-up story using the same adapter pattern S3 builds. `opencode-go` is a new slug not currently listed in spec section 6.4; a note in Section 7 flags the spec-update PR that will add it.

Reasoning kept on record:

- Shipping two providers well beats shipping five providers in a rush. Each real adapter carries fixture work, pricing maintenance, and an ongoing "did the upstream response shape change" exposure; dividing that attention by five front-loads risk with no proportional user gain.
- OpenRouter's catalog alone delivers coverage across the major foundation-model families through one adapter, so "only two providers" does not mean "only two model families on the leaderboard".
- The MVP provider list is a product decision, not a spec constraint. The spec's list is aspirational; the spec will be updated in the same PR that lands this design.

### Q2. Budget DNF semantics

- **A.** Post-hoc check: after each turn, compare accumulated cost against budget; terminate if at or over. Recommended.
- **B.** Predictive check using pricing estimators.
- **C.** Hybrid predictive plus post-hoc safety net.

**Chosen: A.** Post-hoc.

Reasoning kept on record:

- The benchmark measures actual provider behaviour; the budget must be enforced against real reported cost.
- "Overshoot by one turn" is how real-world API spend limits behave (OpenAI organization caps, Anthropic organization caps). Users will not be surprised.
- `estimatedCostRange` on the Start button already communicates a sane upper bound up front; predictive work belongs in that surface, not inside the per-turn loop.
- Reasoning-token variability is our primary differentiator metric; a predictive check based on estimators would couple the `dnf_budget` rate to estimator calibration quality instead of actual spend.
- Since `dnf_budget` never feeds the leaderboard (spec section 4.5, `won` only), the overshoot has no leaderboard-honesty impact.

### Q3. Budget input UX on `/play`

- **A.** Required, no default.
- **B.** Required, pre-filled with `estimatedCostRange.max`. Recommended.
- **C.** Optional; null/unlimited default.

**Chosen: C (with explicit "null or 0 means no cap").** The budget field on `/play` is optional. Empty field and `0` both persist as `NULL` in `runs.budget_usd_micros`. `estimatedCostRange` stays surfaced on the Start button as information only. `dnf_budget` arms only when `budget_usd_micros` is a positive non-null integer. No client-side floor check; a budget smaller than `estimatedCostRange.min` simply runs until it DNFs.

Reasoning kept on record:

- Pre-filling imposes a first-use tax on casual users and makes the form feel bureaucratic.
- Spec section 5.1 makes `budget_usd_micros` nullable; the UI should mirror that directly rather than fight it.
- The Start-button range already sets expectations without forcing a number.
- The niche user (operator pasting their own key for a benchmark run) is better served by honesty about the no-cap case than by a paternalistic default.

## 4. Design

### 4.1 Provider adapters

**New files.**

- `backend/src/providers/http-client.ts`: one shared HTTP helper with an injected `fetch`. Applies the spec-section-6.5 backoff `500/1500/4500` ms up to three tries; 429 honours `Retry-After` up to a hard ceiling of 30 s (a single turn must not stall for hours). Returns `{ ok: true, status, body, headers, durationMs }` or throws `TransientFailure` (retries exhausted) or `NonRetriable4xx` (auth, quota, malformed).
- `backend/src/providers/image-encoding.ts`: turns the board `Uint8Array` into the shape each provider wants (base64 data-URL for OpenAI-compatible formats; raw base64 for any non-OpenAI-compatible future adapters among the deferred post-MVP slugs `anthropic`, `google`, and `zai`). `zai` is the canonical slug; "Zhipu" refers to the company behind GLM models but is never used as a slug in code or spec.
- `backend/src/providers/openrouter.ts` and `backend/src/providers/opencode-go.ts`: one adapter per MVP-S3 provider. Each exports a factory `createXxxAdapter(deps: { fetch, pricing })`. Additional adapters (`openai.ts`, `anthropic.ts`, `google.ts`, `zai.ts`) are not added in this story; they are post-MVP follow-ups that reuse the same shared HTTP client, image-encoding helper, and contract-test harness.
- `backend/src/providers/index.ts`: assembles the runtime registry with real `fetch` and real `pricing`. Tests build their own registry.

**Changed files.**

- `backend/src/providers/types.ts`: extend the contract so the engine can distinguish error classes without convention. `call` stays `Promise<ProviderCallOutput>` on success; on failure it throws a `ProviderError` discriminated union (`{ kind: "transient", cause }` or `{ kind: "unreachable", cause }`). The engine catches these and maps them per spec section 6.5.
- `backend/src/providers/mock.ts`: grow a test-only options bag (`costUsdMicros`, `tokensIn`, `tokensOut`, `reasoningTokens`, `failure: "transient" | "unreachable" | null`). Production mock entry ignores these options.

**Adapter responsibilities.**

1. Build the provider-specific request body from `ProviderCallInput` (image base64, system prompt, ships-remaining text, prior-shots list).
2. POST via the shared HTTP client. API key in the provider's auth header; never logged, never persisted, never returned.
3. On 2xx: parse usage into `tokensIn`, `tokensOut`, `reasoningTokens`; strip any thinking/reasoning blocks before populating `rawText` (spec section 5.1 `raw_response` rule).
4. Compute `costUsdMicros` via `pricing.computeCostMicros(entry, tokensIn, tokensOut)`.
5. Emit `ProviderCallOutput` with `durationMs` measured around the winning HTTP call only.

**Ownership boundaries.** Shot JSON parsing and `hit`/`miss`/`sunk`/`invalid_coordinate`/`schema_error` classification stay in `runs/engine`. Adapters are thin translators.

### 4.2 Pricing module

**File.** `backend/src/providers/pricing.ts`. Owns the table, cost math, and estimator math. Nothing else knows a dollar value.

**Entry shape.**

```ts
interface PricingEntry {
  providerId: string;
  modelId: string;
  displayName: string;
  hasReasoning: boolean;
  inputMicrosPerMtok: number; // integer: USD * 1e6 per 1M input tokens
  outputMicrosPerMtok: number; // integer: USD * 1e6 per 1M output tokens
  estimatedPromptTokens: number; // per-turn text input estimate
  estimatedImageTokens: number; // per-turn image-input estimate
  estimatedOutputTokensPerShot: number; // per-turn total output estimate (INCLUDES reasoning tokens: matches the provider-reported `completion_tokens`/`output_tokens`, which already include chain-of-thought for reasoning models). The "Reasoning models may cost more" caption on the Start button refers to high per-shot variance around this estimate, not a separate unpriced component.
  priceSource: string; // URL of the provider's pricing page
  lastReviewedAt: string; // ISO date
}
```

Rows sorted by `providerId` then by `displayName` so PR diffs are easy to read.

**Cost math.**

```
costMicros(entry, tokensIn, tokensOut) =
    floor(tokensIn  * entry.inputMicrosPerMtok  / 1_000_000)
  + floor(tokensOut * entry.outputMicrosPerMtok / 1_000_000)
```

Floor rounding applied to each half separately. Reasoning tokens are reported and stored but not priced separately, because every provider in scope already bills reasoning output at the output-tokens rate and already includes it inside their reported `output_tokens`; pricing it again would double-count.

Sub-micro costs round to zero. Accepted; `1e-6` USD is our honesty-of-measurement quantum.

**Estimator math.**

```
perTurnMicros(entry) =
    floor((entry.estimatedPromptTokens + entry.estimatedImageTokens)
          * entry.inputMicrosPerMtok / 1_000_000)
  + floor(entry.estimatedOutputTokensPerShot
          * entry.outputMicrosPerMtok / 1_000_000)

estimateCostRangeMicros(entry) = {
  minMicros:  17 * perTurnMicros(entry),
  maxMicros: 100 * perTurnMicros(entry),
}
```

Reasoning tokens are not included in the estimate (spec section 6.2). `/api/providers` exposes `hasReasoning` so the Start button can surface a "Reasoning models may cost more" caption.

**Module API.**

- `getPricingEntry(providerId, modelId): PricingEntry | undefined`.
- `computeCostMicros(entry, tokensIn, tokensOut): number`.
- `estimateCostRangeMicros(entry): { minMicros, maxMicros }`.
- `listPricedModels(): readonly PricingEntry[]`.

**Unit coverage required before adapter wiring.**

1. Known-input fixed-rate cost across prompt-dominant, output-dominant, and mixed turns.
2. Floor-rounding at the sub-micro boundary (single-token calls at cheap rates round to 0).
3. Additive consistency: sum of per-turn integer totals equals `runs.cost_usd_micros` by construction.
4. `estimateCostRangeMicros` returns the correct multiples of `perTurnMicros` for every entry.

**Table maintenance.** Per spec section 6.2, editing a row is a PR that bumps `lastReviewedAt` to the review's UTC date; if numbers changed, the commit message carries the effective date. The table is populated inside the S3 implementation plan at fixture-capture time against the live `priceSource` page.

### 4.3 Budget DNF path

**Data flow.** `POST /api/runs` accepts `budgetUsd?: number`; the route converts via `Math.floor(budgetUsd * 1_000_000)` and persists `runs.budget_usd_micros`. `null`, `undefined`, and `0` all map to `NULL`; negative values reject with `invalid_input`.

**Outcome FSM change (`backend/src/runs/outcome.ts`).** Add a pure `dnf_budget` transition. Input grows two fields: `accumulatedCostMicros`, `budgetMicros`. Evaluation order is fixed and documented in the module:

1. `won` (17 ship cells hit).
2. `dnf_shot_cap` (100 legal shots fired).
3. `dnf_schema_errors` (5 consecutive schema errors).
4. `dnf_budget` (`budgetMicros != null && accumulatedCostMicros >= budgetMicros`).

Edge-case resolutions that fall out of the ordering:

- Turn that wins and crosses the budget: `won`.
- Turn that hits the fifth consecutive schema error and crosses the budget: `dnf_schema_errors`.

Both are covered by explicit tests so the ordering never drifts.

**Engine hook (`backend/src/runs/engine.ts`).** After persisting `run_shots`, the engine updates an in-memory `accumulatedCostMicros` counter and passes it to `outcome`. Persisting `runs.cost_usd_micros` happens once on terminal state (spec section 4.1).

**Mock options (test-only).**

```ts
interface MockOptions {
  costUsdMicros?: number; // per-turn synthetic cost, default 0
  tokensIn?: number; // default 0
  tokensOut?: number; // default 0
  reasoningTokens?: number | null; // default null
  failure?: "transient" | "unreachable" | null;
}
```

**Integration tests added in this story.**

1. Budget set, mock cost > 0: terminates with `dnf_budget` on the turn whose accumulated cost first meets or exceeds the cap; asserts exact turn index, final `runs.cost_usd_micros`, outcome.
2. Budget null: no DNF from budget; run terminates via another path.
3. Budget zero: same as null.
4. Win on the crossing turn: outcome is `won`.
5. Fifth consecutive schema error coincident with crossing: outcome is `dnf_schema_errors`.
6. Negative budget: `POST /api/runs` returns `400 { code: "invalid_input" }`.

### 4.4 `GET /api/providers`

**Response shape.**

```ts
interface ProvidersResponse {
  providers: Array<{
    id: string;
    displayName: string;
    models: Array<{
      id: string;
      displayName: string;
      hasReasoning: boolean;
      pricing: {
        inputUsdPerMtok: number;
        outputUsdPerMtok: number;
      };
      estimatedPromptTokens: number;
      estimatedImageTokens: number;
      estimatedOutputTokensPerShot: number;
      estimatedCostRange: { minUsd: number; maxUsd: number };
      priceSource: string;
      lastReviewedAt: string;
    }>;
  }>;
}
```

Internal math stays in integer micros; conversion to decimal USD happens once at serialization (`value / 1_000_000`).

**Source of truth.** Reads `PRICING_TABLE`; groups by provider; sorts. No DB access. Mock is deliberately excluded from this endpoint; the `/play` picker injects a separate "mock (for staging tests)" option on the staging build only (gated by `import.meta.env.MODE`). Production web builds never render the mock option.

**Caching.** Response body memoized at process start. `Cache-Control: public, max-age=60`. `ETag` is a hash of the serialized body; a CI assertion catches "table edited without bumping `lastReviewedAt`".

**Query params.** None. Filtering on a tiny response is a client concern.

**Errors.** Empty-table case (pricing file absent) returns `500 { code: "internal" }`.

**Integration tests.**

1. Response shape matches the TypeScript type in `shared/`.
2. `estimatedCostRange.minUsd` and `maxUsd` equal `perTurnMicros * 17 / 1e6` and `* 100 / 1e6`.
3. Mock is not present even when the backend registry has a mock adapter wired.
4. `Cache-Control` and `ETag` present; ETag stable across two consecutive calls.

**Start-button wiring on `/play`.** The model-picker island reads `/api/providers`, attaches `estimatedCostRange` as a caption ("est. $0.04 - $1.12"), and when `hasReasoning` is true, appends "Reasoning models may cost more". No prefill of the budget field (per Q3).

### 4.5 Leaderboard

**Endpoint.** `GET /api/leaderboard?scope=today|all&providerId?=&modelId?=`. `scope` required; no pagination in MVP.

**Response shape.**

```ts
interface LeaderboardResponse {
  scope: "today" | "all";
  seedDate: string | null;
  rows: Array<{
    rank: number;
    providerId: string;
    modelId: string;
    displayName: string;
    shotsToWin: number;
    runsCount: number;
    bestRunId: string | null;
  }>;
}
```

**SQL for `scope=today`.** One statement, window functions.

```sql
WITH session_best AS (
  SELECT r.*,
         ROW_NUMBER() OVER (
           PARTITION BY client_session, provider_id, model_id
           ORDER BY shots_fired ASC, started_at ASC
         ) AS rn
    FROM runs r
   WHERE outcome = 'won'
     AND seed_date = :today
     AND (:providerId IS NULL OR provider_id = :providerId)
     AND (:modelId    IS NULL OR model_id    = :modelId)
),
day_best AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY provider_id, model_id
           ORDER BY shots_fired ASC, started_at ASC
         ) AS drn
    FROM session_best WHERE rn = 1
)
SELECT id AS best_run_id,
       provider_id, model_id, display_name, shots_fired AS shots_to_win
  FROM day_best
 WHERE drn = 1
 ORDER BY shots_to_win ASC, display_name ASC;
```

Dedup by first CTE; cross-session best by the second. Partitions key on `(provider_id, model_id)` to match `AGENTS.md`'s "leaderboard by `(providerId, modelId)`" rule; two different providers offering the same raw `model_id` stay on separate leaderboard rows. Deterministic tiebreakers.

**SQL for `scope=all`.** Two stages: fetch session-dedup'd wins across all seed dates, then compute medians in TS.

```sql
WITH session_best_per_day AS (
  SELECT r.*,
         ROW_NUMBER() OVER (
           PARTITION BY client_session, provider_id, model_id, seed_date
           ORDER BY shots_fired ASC, started_at ASC
         ) AS rn
    FROM runs r
   WHERE outcome = 'won'
     AND (:providerId IS NULL OR provider_id = :providerId)
     AND (:modelId    IS NULL OR model_id    = :modelId)
)
SELECT provider_id, model_id, display_name, shots_fired
  FROM session_best_per_day
 WHERE rn = 1;
```

Handler groups by `(providerId, modelId)`, computes classical median per group (mean of the two middle elements for even-N), sorts by median asc, `runsCount` desc, `displayName` asc.

**Display-name sourcing.** From `runs.display_name` (persisted at run creation), not cross-joined to the pricing table. Historical rows keep the name they ran under.

**Filter semantics.** `providerId` without `modelId` allowed; `modelId` without `providerId` allowed. Both null means unfiltered.

**`client_session` degeneracy.** If a row has `client_session = NULL`, the window-function partition collapses all NULLs together. S2 issues the cookie unconditionally, so this does not occur in practice; an integration test guards the invariant.

**Caching.** `Cache-Control: no-store`. The home page re-fetches on filter change; UTC-rollover staleness at 23:59 -> 00:01 is a worse failure mode than a fresh query.

**Integration tests.**

1. Empty DB returns `rows: []` for both scopes.
2. `scope=today` only returns wins on today's UTC seed; a yesterday win is excluded.
3. Session dedup: two wins by the same session for the same (model, seed) collapse to the lower-shots row.
4. Cross-session best: two sessions win the same model on the same day; lower-shots row ranks first.
5. DNF runs never appear in either scope.
6. `scope=all` median: wins `[15, 20, 30]` -> median `20`; wins `[15, 20, 25, 30]` -> median `22.5`.
7. `providerId` and `modelId` filters narrow correctly and interact correctly.
8. `runs.display_name` preserved historically.
9. Determinism across repeat calls.
10. `Cache-Control: no-store` present.

### 4.6 `GET /api/board`

**Signature.** `GET /api/board?date=YYYY-MM-DD`, `date` optional. Returns `image/png`.

**Behaviour.**

1. Absent `date`: use today's UTC date.
2. Validate `date` as `YYYY-MM-DD` against an actual calendar; malformed -> `400 { code: "invalid_input", detail: { date: "..." } }`.
3. `date` strictly greater than today UTC -> `400 { code: "invalid_input", detail: { date: "future" } }`.
4. Past and present accepted; pass through `board/generator` and `board/renderer` with an empty shots list.

**Caching.**

- With explicit `date`: `Cache-Control: public, max-age=86400, immutable`.
- Without `date`: `Cache-Control: no-cache, must-revalidate` (URL does not change across UTC rollover).
- `ETag` is a hash of the seed-date string; supports `304`.

**Integration tests.**

1. `GET /api/board?date=2026-04-24` -> 200, `image/png`, non-empty body.
2. Same date twice -> byte-identical bodies.
3. `GET /api/board` (no date) -> today, `no-cache, must-revalidate`.
4. Future date -> `400`.
5. Non-date string -> `400`; generator not invoked (spy).
6. `ETag` present; `If-None-Match` match -> `304` with empty body.

### 4.7 Home page

**File changes.**

- `web/src/pages/index.astro`: replace placeholder with the three-section layout below.
- `web/src/islands/Leaderboard.tsx` (new): one Solid island owning filter state and the ranked table together.
- `web/src/lib/api.ts` (extend): typed wrappers for `GET /api/leaderboard` and `GET /api/providers`.

No separate `LeaderboardFilters` island. Architecture doc section 2.2 lists the name indicatively; splitting a filter island from a table island that share their entire state means either a Solid-context bridge across `client:load` roots or URL-as-state hacks. Neither is worth it for three controls.

**Layout (mobile-first vertical stack).**

1. Header: brand mark, single "Start a run" CTA to `/play`.
2. Today's board preview: inline SVG empty 10x10 grid with axis labels; caption "Seed `${today}` UTC".
3. Leaderboard section: heading; `<Leaderboard />` island; initial SSR emits a skeleton, hydration fetches data.

Desktop uses the same stack inside a max-width column (spec section 7.3). No side-by-side layouts, no sticky columns.

**Why inline SVG, not `<img src="/api/board?date=...">`.** Empty board carries no ship positions and needs no network. SVG scales crisply on Retina. `/api/board` stays in the design for the replay page and external verifiability.

**`<Leaderboard />` island.**

- Solid signals: `scope`, `providerId`, `modelId`, `providers`, `rows`, `loading`, `error`.
- Effects: on mount fetch `/api/providers` then `/api/leaderboard?scope=today`; on filter change re-fetch; `providerId` changes clear `modelId`; `AbortController` on in-flight requests.
- UI: segmented control ("Today" / "All time"); provider and model `<select>` controls; rank/model/provider/shots/runs/replay table; empty-state copy ("No runs yet for this filter. Be the first - pick a model on `/play`."); error state renders the closed-set envelope with a "Retry" button.
- Accessibility: labelled `<select>`; segmented control either radio-fieldset or ARIA tablist; touch targets clear 44px.

**Playwright coverage (see Section 4.10).**

### 4.8 Replay viewer

**Files.**

- `web/src/pages/runs/[id]/replay.astro` (new).
- `web/src/islands/ReplayPlayer.tsx` (new).
- `web/src/islands/replayReducer.ts` (new): pure reducer, unit-tested.
- `web/src/islands/ReplayPlayer.module.css` (new).
- `web/src/islands/BoardView.tsx` (reuse from S2).

No backend work.

**State machine.**

```ts
type ReplayState =
  | { status: "loading"; idx: 0; speed: 1 | 2 | 4 }
  | { status: "error"; error: ErrorEnvelope }
  | { status: "idle"; run: RunMeta; shots: RunShot[]; idx: number; speed: 1 | 2 | 4 }
  | { status: "playing"; run: RunMeta; shots: RunShot[]; idx: number; speed: 1 | 2 | 4 }
  | { status: "done"; run: RunMeta; shots: RunShot[]; idx: number; speed: 1 | 2 | 4 };

type ReplayAction =
  | { kind: "loaded"; run: RunMeta; shots: RunShot[] }
  | { kind: "loadFailed"; error: ErrorEnvelope }
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "tick" }
  | { kind: "seek"; idx: number }
  | { kind: "stepForward" }
  | { kind: "stepBack" }
  | { kind: "speed"; speed: 1 | 2 | 4 };
```

- `idx` counts shots revealed so far.
- `tick` increments `idx`; reaching `shots.length` flips to `done`; subsequent `tick` is a no-op.
- `play` from `done` auto-rewinds to `idx = 0`.
- `seek` clamps to `[0, shots.length]`.
- Interval side effect is owned by the island, not the reducer.

**Timing.** `Math.round(800 / speed)` ms: 800 at 1x, 400 at 2x, 200 at 4x. Original wall-clock gaps not reproduced.

**Data loading.** Two parallel requests on mount: `GET /api/runs/:id` and `GET /api/runs/:id/shots`. Partial-history (`outcome === null`): shows a banner linking to `/runs/:id` live view but still renders captured shots.

**Layout (mobile-first vertical stack).** Header with model/seed/outcome; board at current idx; transport row (back/play-pause/forward/scrubber/speed toggle); shot detail pane; counters pane.

**Unit tests on the reducer.**

1. Initial `{ status: "loading", idx: 0, speed: 1 }`.
2. `loaded` zero-shot: `{ status: "idle", idx: 0 }`.
3. `loadFailed`: `{ status: "error" }`.
4. `play` from `idle`: `playing`; each `tick` advances idx by 1.
5. `tick` crossing final shot: `done`; further `tick` no-op.
6. `play` from `done`: rewind to 0, flip to `playing`.
7. `seek` clamps below 0 and above length.
8. `stepForward` at end, `stepBack` at 0: both no-op.
9. `speed` updates value; reducer does not touch timing.

### 4.9 Contract tests

**Fixture layout.** Per-provider, not per-model, limited to the two MVP-S3 providers:

```
backend/tests/fixtures/providers/
  openrouter/    (happy, schema-error, token-edge, auth-401, rate-limited-429, transient-5xx, reasoning-response)
  opencode-go/   (same set)
```

Approximately 6 files per provider, ~12 total. `reasoning-response.json` is added only where at least one priced model under that provider has `hasReasoning = true`. Post-MVP providers add their own directories when their adapter story lands.

**Fixture envelope.** One JSON per file describing a single response or a short sequence for retry testing:

```json
{
  "request": {
    "assertUrlContains": "openrouter.ai/api/v1/chat/completions",
    "assertMethod": "POST",
    "assertBodyContains": { "model": "<stand-in>", "messages": "..." },
    "assertHeaderPresent": ["authorization"]
  },
  "responses": [
    { "status": 429, "headers": { "retry-after": "1" }, "body": { "error": { "message": "rate limited" } } },
    { "status": 200, "headers": { "content-type": "application/json" }, "body": { "...captured response..." } }
  ]
}
```

**Harness.** `backend/tests/integration/providers/harness.ts`:

- `buildFetch(fixture)`: returns a `typeof fetch` that responds in sequence and records requests.
- `assertRequest(recorded, fixture)`: deep-partial comparison on body; exact match on method and URL substring.
- `redact(raw)`: strips auth headers, `x-*-id` headers, provider-key-shaped strings.

Only builds `Response` and `Request` objects; no `node:net` or `undici` imports.

**Per-provider test files.** One file per provider with:

- Happy path: parses shot, tokens, and cost.
- Schema-error: `rawText` preserved; engine will classify it.
- Token-usage edge: reasoning tokens reported, counted in `tokensOut` once (not double-counted).
- Auth failure: throws `NonRetriable4xx` on 401.
- Rate-limited: retries once on 429+Retry-After, then succeeds.
- Transient: exhausts three retries on 503, throws `TransientFailure`.

**Invariants asserted in every provider suite.**

1. Outgoing auth header present and equals the test's opaque API key verbatim.
2. `ProviderCallOutput` never contains the API key anywhere; no log emits the key (spies on every `console.*` level).
3. `rawText` for 2xx equals the provider's user-visible text with reasoning/thinking stripped.
4. `tokensIn` + `tokensOut` match the provider's `usage` exactly; `reasoningTokens` reported or `null`.
5. `durationMs` reflects the winning request's duration, not the sum of retries.
6. `costUsdMicros` equals `pricing.computeCostMicros(entry, tokensIn, tokensOut)`.

**Retry ceiling.** Dedicated test for `Retry-After: 9999` capped by the adapter's 30 s ceiling, then surfaced as `TransientFailure`.

**Capture script.** `backend/scripts/capture-fixture.ts`:

```
bun run backend/scripts/capture-fixture.ts \
  --provider openrouter \
  --model <id> \
  --scenario happy-path \
  --key $OPENROUTER_KEY \
  --input path/to/test-board.png
```

Captures, redacts, writes to the right path with a `_meta` field. Committed but never run in CI. If implementation time is tight, the script can slip to a follow-up PR as long as initial fixtures land hand-written.

**What contract tests deliberately do not cover.** Streaming, multi-turn threading, tool-use, structured-output modes.

### 4.10 Playwright smoke

**Files.**

- `web/tests/e2e/smoke.spec.ts` (extend): S2's mock-win test plus three new scenarios.
- `web/tests/e2e/helpers/run.ts` (new): fill `/play`, wait for SSE event, wait for terminal, fetch run metadata.

**Four scenarios.**

1. **Mock run to `won`** (inherited from S2).
2. **Mock run to `dnf_budget`.** Uses a staging-only URL knob `/play?mockCost=0.00400` forwarded into the `POST /api/runs` body; the mock adapter honours the hint only in the staging build (production strips it). The test asserts `outcome === "dnf_budget"` and `runs.cost_usd_micros > budget_usd_micros - perTurnMicros` (the overshoot-by-one-turn semantics).
3. **Leaderboard surface.** After scenarios 1 and 2 land, `/` renders today's board, the leaderboard contains the mock model, scope toggle issues a fresh request, filters narrow the table.
4. **Replay.** Click replay link on the leaderboard row for scenario 1; `/runs/:id/replay` loads; scrubber max equals `shots_fired`; play advances idx; 2x increases the rate; scrub to mid-run renders partial state.

**Why the URL knob, not a dedicated endpoint.** Adding an endpoint widens the API surface for one test and creates a prod-vs-staging drift risk. A query parameter that only the staging web build reads (gated by `import.meta.env.MODE === "staging"`) keeps the production API clean.

**Local run.** `bun run --cwd web test:e2e`. `PLAYWRIGHT_BASE_URL` env points at staging or a local dev server.

**Determinism.** Mock shot sequence plus daily seed reproduce byte-identical runs on repeat. Budget scenario computes its budget from the mock's configured per-turn cost so arithmetic stays tight. Replay scenario asserts on state transitions, not wall-clock.

**Not covered by the smoke (deferred to S4).** Maintenance modes, `aborted_server_restart`, seed rollover. Real-key runs are covered by the separate manual smoke described in Section 4.11, not by this Playwright suite.

### 4.11 Manual real-token smoke

Scripted, repeatable, and deliberately outside CI. Exists because contract tests prove "we parsed a captured response correctly" but do not prove "the upstream endpoint still accepts our request shape and returns what we expect today". The manual smoke closes that gap on human demand, using a real API key.

**File.**

- `backend/scripts/smoke-real-keys.ts` (new): CLI entrypoint. Not discovered by `bun test`; never reachable from `pr.yml` or `deploy-staging.yml`.

**Invocation.**

```
bun run backend/scripts/smoke-real-keys.ts --provider openrouter --key $OPENROUTER_KEY
bun run backend/scripts/smoke-real-keys.ts --provider opencode-go --key $OPENCODE_GO_KEY
bun run backend/scripts/smoke-real-keys.ts --all --openrouter-key $K1 --opencode-go-key $K2
```

Flags:

- `--provider <id>`: the provider slug (`openrouter` or `opencode-go` in S3). Repeated or replaced by `--all`.
- `--key <value>` (or `--<provider>-key <value>`): the API key for that provider. Never read from a file committed to the repo; only from argv or env.
- `--model <id>`: optional; default picks the cheapest priced model for the provider so a casual operator does not blow money by accident.
- `--turns <n>`: optional cap on the number of turns the script will run, default 3. Zero means "run to terminal state" and prints a confirmation prompt before starting because it can cost more.
- `--budget <usd>`: optional; default `$0.05`. The script enforces the budget client-side and halts the loop as soon as it crosses. This is a second layer of protection on top of the server-side `dnf_budget` path.
- `--dry-run`: if set, the script prints the request it _would_ have made and exits without calling the provider.

**What it actually does.**

1. Loads the `PRICING_TABLE` entry for `(providerId, modelId)`; refuses to run if the pair is unknown.
2. Constructs the real `ProviderAdapter` (same factory the backend uses) with `fetch` = `globalThis.fetch` and the real pricing module.
3. Renders a fresh board for today's UTC seed via the real `board/generator` and `board/renderer`.
4. Calls `adapter.call` once per turn, up to `--turns` or until the adapter throws, or the budget guard fires, or the run reaches a terminal state.
5. Prints per-turn diagnostics: status, tokens, cost, `rawText` truncated, parsed shot or schema-error classification.
6. At exit: prints final accumulated cost, total tokens, outcome label, and a hint about how to land a pricing-table PR if the observed token usage per turn drifts far from the current estimator values.

**Why it is not a `bun test` target.**

- A developer runs `bun test` hundreds of times a week. One accidental `bun test` run with real env vars set would spend money. Keeping the real-token entrypoint outside `bun test` makes it impossible to hit by reflex.
- The closed-CI promise in spec section 8.3 ("No CI run spends real provider tokens") is load-bearing for the project's money-safety story. Adding a conditional-skip inside `bun test` that silently passes when env vars are absent would create a CI path that _could_ spend tokens if env vars ever leak into CI. A separate file that CI never calls is cleaner.

**What it asserts.**

- Adapter parsed the response without throwing.
- `tokensIn` and `tokensOut` are positive non-zero integers (a regression catches "upstream stopped returning `usage`").
- `costUsdMicros` equals `pricing.computeCostMicros(...)` recomputed from reported tokens.
- `rawText` is non-empty for at least one turn.
- If `--turns 0` and the run reaches `won`, the script also verifies the live backend's leaderboard row matches after re-inserting the run via a normal `POST /api/runs`. The dev loop for this last step is documented in the script's `--help`.

**Safety rails.**

- Refuses to run if `NODE_ENV === "production"` and `--force-prod` is not passed (prevents accidentally pointing at prod during a real-key call).
- Refuses to persist anything to the production DB; the script writes to `DATABASE_PATH` only if it is `:memory:`, `/tmp/*`, or contains `-test-`, matching the test guard in spec section 8.2. The default is an ephemeral in-memory database.
- Redacts the API key from every printed line via the same allowlist the log middleware uses.
- After a terminal run, the script emits a single JSON line with `{ providerId, modelId, outcome, shotsFired, costUsdMicros, tokensIn, tokensOut }` so a human can paste the line into a PR description, matching `plan.md` section 6.5 task 15's "record the result" requirement.

**Cadence.**

- Before any pricing-table PR (to validate the current estimators are still close to reality).
- Before a production cutover (S4) for each MVP provider.
- On human suspicion of upstream drift.

**Not in this script.**

- No attempt to replace the contract-test suite. Contract tests continue to run in CI, unchanged.
- No batching across providers in one process; `--all` loops the same entrypoint serially with per-provider keys.
- No dashboard, no JSON output file, no Slack/webhook integration. The script prints to stdout and exits.

## 5. Acceptance-criteria crosswalk

Every S3 acceptance criterion from `docs/plan.md` section 6.2 maps to a section of this design so the implementation plan inherits a coverage floor.

The `plan.md` criterion currently lists five real adapters. Per the Q1.1 decision, S3 narrows this to two (`openrouter`, `opencode-go`); the remaining three adapters are post-MVP follow-ups that reuse the same adapter pattern. `plan.md` section 6.2 is updated in the same PR that lands this design.

| Criterion                                                                                                                                                               | Delivered by                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Real provider adapters (two in MVP-S3; `openai`, `anthropic`, `google`, `zai` deferred) implement the interface with contract tests against captured redacted fixtures. | Sections 4.1 and 4.9.                                                                                          |
| Manual real-token smoke proves the two shipped adapters still work against live upstreams on human demand.                                                              | Section 4.11.                                                                                                  |
| `providers/pricing.ts` per-exact-model-id table with documented PR workflow.                                                                                            | Section 4.2.                                                                                                   |
| `runs/engine` writes `cost_usd_micros` per `run_shots`, rolls up to `runs.cost_usd_micros` at terminal state.                                                           | Section 4.3.                                                                                                   |
| `dnf_budget` reachable, covered by a mock-provider test with synthetic per-turn cost.                                                                                   | Section 4.3.                                                                                                   |
| `GET /api/providers` returns `pricing`, `priceSource`, `lastReviewedAt`, `estimatedCostRange`; Start button shows the range.                                            | Section 4.4.                                                                                                   |
| `GET /api/leaderboard` supports `scope=today` and `scope=all` with provider and model filters.                                                                          | Section 4.5.                                                                                                   |
| Home page renders today's board and the leaderboard with filter islands.                                                                                                | Section 4.7 (plus 4.6 for the `/api/board` endpoint that supports external verifiability and the replay page). |
| `/runs/:id/replay` plays back any archived run at 1x/2x/4x with a playhead.                                                                                             | Section 4.8.                                                                                                   |
| Playwright smoke covers mock end-to-end, budget DNF, leaderboard, and replay.                                                                                           | Section 4.10.                                                                                                  |

**Cross-cutting deliverables** implied by the story but not explicitly enumerated:

- `GET /api/board` is built in this story (Section 4.6) even though S3 acceptance criteria do not list it explicitly. The replay page reads it for archived-date boards, the product's external-verifiability story justifies it, and spec section 5.2 already specifies it.
- `shared/src/types.ts` grows the typed response contracts for `/api/providers` and `/api/leaderboard`. No new file layout decisions.

## 6. Risks and mitigations

- **Upstream provider response drift.** The contract-test suite detects this; a failure on a released adapter is the tripwire. Mitigation: run the full `bun test` on every PR; any fixture refresh is a focused PR that bumps `lastReviewedAt`.
- **Pricing-table staleness.** `lastReviewedAt` discipline and the ETag regression test on `/api/providers` surface missed bumps. Mitigation: the broad-catalog choice increases maintenance cost; the team accepts this cost deliberately (Q1 rationale).
- **Budget overshoot surprise.** `dnf_budget` overshoots by one turn's cost. Mitigation: the run's terminal row carries the actual `cost_usd_micros` and `budget_usd_micros`, so a curious user can always see the gap; no additional UI copy is added because the overshoot is the spec-aligned behaviour (Q2 rationale).
- **Leaderboard false parity.** Median over many session-deduped wins can mask a single lucky run. Mitigation: `runsCount` is shown and ties are broken by `runsCount desc`; the home page presents the number explicitly rather than hiding it.
- **Replay wall-clock confusion.** Users could think the 1x cadence is the model's actual thinking time. Mitigation: "playback" caption next to the speed toggle.

## 7. Open items for the implementation plan

These do not need design sign-off but must be captured as explicit tasks in the plan that follows:

- Update `docs/spec.md` section 6.4 and `docs/plan.md` section 6.2 in the same PR that lands this design: replace the five-provider MVP list with the two-provider MVP-S3 list (`openrouter`, `opencode-go`, plus `mock`); relegate `openai`, `anthropic`, `google`, `zai` to a named "post-MVP providers" bullet so the long-term roadmap stays visible.
- Resolve the exact upstream endpoint, auth scheme, request/response shapes, and pricing for `opencode-go`; that data is not yet captured anywhere in the repo. The canonical slug throughout this spec, the plan, the openspec change folders, and the code is `opencode-go` (hyphenated); product owner has confirmed the hyphen form.
- Capture current vision-model catalog per MVP provider (OpenRouter, opencode-go) against their live pricing pages on the day of capture. Populate `PRICING_TABLE` with verified `inputMicrosPerMtok`, `outputMicrosPerMtok`, and the three estimators per row; `priceSource` must link to the actual page consulted.
- For every priced model, capture the shared per-provider fixture set (happy, schema-error, token-edge, auth-401, rate-limited-429, transient-5xx) once. Per-model fixtures only where needed to exercise a model-specific response shape quirk.
- Implement `backend/scripts/smoke-real-keys.ts` per Section 4.11. Confirm with `--dry-run` before first real invocation. Add a short runbook page under `docs/ops/` on when and how to run the script.
- Add the `staging`-only mock cost knob to the web build and the backend's mock adapter.
- Wire the `/play` Start-button caption to `estimatedCostRange` and `hasReasoning`.
- Wire the leaderboard row's replay link on the home page.
- Extend `shared/src/types.ts` with `ProvidersResponse`, `LeaderboardResponse`, `ProviderError` union.

## 8. Attribution

Skills used: superpowers:brainstorming.
Docs used: `docs/about.md`, `docs/architecture.md`, `docs/plan.md`, `docs/spec.md`, `CLAUDE.md`.
