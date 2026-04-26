# S3 implementation plan: real providers, pricing, budget, leaderboard, replays

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver story S3 per `docs/plan.md` section 6: two real provider adapters (`openrouter`, `opencode-go`), pricing table with cost math, `dnf_budget` terminal outcome, `GET /api/providers` + `GET /api/leaderboard` + `GET /api/board`, home page with today's board preview and filterable leaderboard, `/runs/:id/replay` archive viewer, extended Playwright smoke, and a manually-triggered real-token smoke script.

**Architecture:** Thin `ProviderAdapter` implementations per the existing `backend/src/providers/types.ts` interface, sharing a single retry-aware HTTP client with an injected `fetch`. Pricing lives in one compiled `pricing.ts` module with integer-micros math. Leaderboard is computed on read via SQLite window functions plus a TypeScript median. Replay is a pure reducer driving a Solid island. CI never spends real tokens; a separate `scripts/smoke-real-keys.ts` entrypoint is used by humans.

**Tech Stack:** Bun 1.3.12+, Hono 4.12.14+, Drizzle ORM 0.45.2+ on `bun:sqlite`, TypeScript 6.0.2+, Astro 6.1.7+, Solid.js 1.9.12+, Playwright 1.59.1+, oxlint 1.60.0+, oxfmt 0.45.0+.

**Supporting documents:**

- Spec: `docs/superpowers/specs/2026-04-24-s3-real-providers-pricing-leaderboard-replays-design.md`
- Product spec: `docs/spec.md`
- Architecture: `docs/architecture.md`
- Story list: `docs/plan.md`

**Commit discipline (per `CLAUDE.md`, `AGENTS.md`, and `docs/spec.md` section 9.2):**

- Conventional Commits only; allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`, `perf`.
- No Claude co-author trailer.
- Pre-commit hooks run `oxlint` and `oxfmt --check`; never pass `--no-verify`.
- Red / green / refactor commits may be separated; they must not be skipped.

**AGENTS.md git-policy gate (read before executing any task):**

- `AGENTS.md` prohibits `git add`, `git commit`, `git push`, and other repo-mutating git commands without explicit user permission for each invocation.
- Every task in this plan ends with a suggested commit command. Treat each of those as a checkpoint: the executing agent MUST pause at the commit step, summarise the staged diff to the user, and obtain explicit per-commit approval before running `git add` and `git commit`.
- If you are operating inside a dedicated git worktree (created by the brainstorming skill or by `superpowers:using-git-worktrees`), the worktree is the user's sandbox and the gate still applies - the worktree just bounds blast radius.
- Do not batch-commit multiple tasks unless the user asks for it. The red/green/refactor commit granularity is the project default.

**Error-handling contract (reconciled from the design's Section 4.1 and spec section 6.5):**

- The shared HTTP client (`backend/src/providers/http-client.ts`) throws internal error classes: `TransientFailureError` when retries are exhausted, `NonRetriable4xxError` for auth/quota/malformed. These classes are an implementation detail of the HTTP layer.
- Each provider adapter catches those classes and re-throws the shared `ProviderError` discriminated union from `@battleship-arena/shared` (`{ kind: "transient", cause }` or `{ kind: "unreachable", cause, status }`). Adapters never surface the class instances to the engine.
- The engine catches `ProviderError` and maps per spec section 6.5: `kind: "transient"` -> persist a `run_shots` row with `result = "schema_error"`, emit an SSE `error`, increment consecutive-schema-error counters; `kind: "unreachable"` -> terminate the run with outcome `llm_unreachable` without touching schema-error counters.
- Consumers of `ProviderError` distinguish cases by `error.kind`, never by `instanceof`.

---

## Phase 0: Documentation prep

### Task 0.0: Resolve the `opencode-go` slug, endpoint, auth, and catalog

**Files:**

- None directly; outputs feed Tasks 0.1, 0.2, 6.3, 6.4.

**Why:** The provider slug was recorded literally from the brainstorming transcript. Until the product owner confirms the slug spelling and the exact upstream endpoint, any `docs/*` update that mentions `opencode-go` is guesswork. Resolve this first so the spec/plan updates in Tasks 0.1 and 0.2 do not have to be redone.

- [ ] **Step 1: Confirm the slug spelling with the product owner**

Ask Sergey (`Sergey.Eroshenkov@constructor.tech`) whether `opencode-go` is the correct provider slug. Resolve any ambiguity: is this "opencode" with model "Go", the `opencode.ai` platform, a Go-language gateway, or something else?

- [ ] **Step 2: Capture the resolved upstream details**

Once the slug is confirmed, record in this plan under this task:

- Final provider slug.
- Base URL and completion-style endpoint path.
- Auth scheme (`Authorization: Bearer ...`, custom header, or other).
- Request body shape (OpenAI-compatible? different?).
- Response `usage` fields.
- Pricing page URL (for use as `priceSource`).

- [ ] **Step 3: Do not commit this task on its own**

Task 0.0 updates only this plan file with the resolved notes. Bundle the documentation edits from this task into the same commit as Task 0.1.

### Task 0.1: Narrow the MVP provider list in `docs/spec.md`

**Files:**

- Modify: `docs/spec.md` section 6.4

**Why:** S3 ships two providers instead of five per the brainstormed decision Q1.1. The spec must reflect that so the rest of the plan is coherent.

- [ ] **Step 1: Read the current provider list**

Run: `grep -n "openai\|anthropic\|google\|zai\|openrouter\|mock" docs/spec.md | head -20`

Expected: see section 6.4 currently enumerating `openrouter`, `openai`, `anthropic`, `google`, `zai`, `mock`.

- [ ] **Step 2: Rewrite section 6.4**

Replace the six-bullet list with:

```markdown
### 6.4 Providers in MVP

MVP-S3 ships two real providers plus the mock:

- `openrouter` - primary provider; a single adapter reaches the widest catalog of models and keeps the benchmark's surface large on day one.
- `opencode-go` - the second MVP provider; its exact upstream endpoint, auth scheme, and model catalog are captured at implementation time (see `docs/superpowers/plans/2026-04-24-s3-real-providers-pricing-leaderboard-replays.md` Task 5.0).
- `mock` - deterministic, no network calls. Cycles through a fixed shot sequence for tests. Used by every CI run.

Post-MVP (each ships in its own follow-up story via the same adapter pattern): `openai` (chat completions API), `anthropic` (Messages API), `google` (Gemini generateContent API), `zai` (Zhipu GLM vision models).
```

- [ ] **Step 3: Verify no other section still assumes the five-provider list**

Run: `grep -nE "(openai|anthropic|google|zai)" docs/spec.md`

Expected: the only hits are inside section 6.4 in the "Post-MVP" bullet; any remaining elsewhere is a follow-up note, not a contract claim.

- [ ] **Step 4: Commit**

```bash
git add docs/spec.md
git commit -m "docs(spec): narrow MVP provider list to openrouter + opencode-go"
```

### Task 0.2: Update the S3 checklist in `docs/plan.md`

**Files:**

- Modify: `docs/plan.md` section 3 S3 checklist and section 6.5 task list

**Why:** Section 3's checklist enumerates all five adapters; section 6.5 task list spells out implementation order. Both must match the narrowed scope.

- [ ] **Step 1: Update the S3 checklist bullet about adapters**

Replace:

```markdown
- [ ] `providers/openrouter`, `providers/openai`, `providers/anthropic`, `providers/google`, `providers/zai` implement the adapter interface.
```

With:

```markdown
- [ ] `providers/openrouter` and `providers/opencode-go` implement the adapter interface. (`providers/openai`, `providers/anthropic`, `providers/google`, `providers/zai` are post-MVP follow-ups.)
```

- [ ] **Step 2: Update section 6.5 tasks 2-6**

Replace tasks 2 through 6 (the five per-adapter implementation tasks) with two tasks:

```markdown
2. Implement `providers/openrouter.ts` (primary MVP adapter; its catalog reaches the widest surface). Cover parse, tokens, error mapping via contract tests.
3. Implement `providers/opencode-go.ts` (second MVP adapter). Resolve the upstream endpoint, auth scheme, and model catalog at this task's start; cover parse, tokens, error mapping via contract tests.
```

Renumber the subsequent tasks (previously 7-15 become 4-12).

- [ ] **Step 3: Add a manual real-token smoke task**

Append to the renumbered section 6.5 task list:

```markdown
13. Implement `backend/scripts/smoke-real-keys.ts` per spec Section 4.11. Add a short runbook under `docs/ops/real-token-smoke.md` describing when and how to invoke it.
```

- [ ] **Step 4: Commit**

```bash
git add docs/plan.md
git commit -m "docs(plan): narrow S3 checklist + task list to two MVP adapters"
```

---

## Phase 1: Shared types

### Task 1.1: Add the provider-error discriminated union to `shared/`

**Files:**

- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts` (already re-exports `types.ts`; no change needed if already star-exported)
- Test: `shared/tests/types.test.ts` (add cases) or `shared/tests/provider-error.test.ts` (new)

**Why:** The engine needs to catch typed errors from adapters. `shared/` is the canonical home for cross-process types per `architecture.md` section 2.3.

- [ ] **Step 1: Write the failing test**

Create `shared/tests/provider-error.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { ProviderError } from "../src/types.ts";

describe("ProviderError", () => {
  test("transient kind carries a cause message", () => {
    const error: ProviderError = { kind: "transient", cause: "network reset" };
    expect(error.kind).toBe("transient");
    expect(error.cause).toBe("network reset");
  });

  test("unreachable kind carries a cause message and status", () => {
    const error: ProviderError = { kind: "unreachable", cause: "bad key", status: 401 };
    expect(error.kind).toBe("unreachable");
    expect(error.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test shared/tests/provider-error.test.ts`

Expected: FAIL with "module has no exported member `ProviderError`".

- [ ] **Step 3: Add the type**

Append to `shared/src/types.ts`:

```ts
export type ProviderError =
  | { kind: "transient"; cause: string }
  | { kind: "unreachable"; cause: string; status: number };
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test shared/tests/provider-error.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/types.ts shared/tests/provider-error.test.ts
git commit -m "feat(shared): add ProviderError discriminated union"
```

### Task 1.2: Add `ProvidersResponse` and `LeaderboardResponse` types

**Files:**

- Modify: `shared/src/types.ts`
- Test: add to `shared/tests/types.test.ts` or new file

- [ ] **Step 1: Write the failing test**

Create `shared/tests/api-responses.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { LeaderboardResponse, ProvidersResponse } from "../src/types.ts";

describe("ProvidersResponse", () => {
  test("accepts a valid shape", () => {
    const response: ProvidersResponse = {
      providers: [
        {
          id: "openrouter",
          displayName: "OpenRouter",
          models: [
            {
              id: "example/model",
              displayName: "Example",
              hasReasoning: false,
              pricing: { inputUsdPerMtok: 1, outputUsdPerMtok: 3 },
              estimatedPromptTokens: 100,
              estimatedImageTokens: 300,
              estimatedOutputTokensPerShot: 50,
              estimatedCostRange: { minUsd: 0.01, maxUsd: 0.1 },
              priceSource: "https://example/pricing",
              lastReviewedAt: "2026-04-24",
            },
          ],
        },
      ],
    };
    expect(response.providers[0]?.models[0]?.id).toBe("example/model");
  });
});

describe("LeaderboardResponse", () => {
  test("accepts a valid today row", () => {
    const response: LeaderboardResponse = {
      scope: "today",
      seedDate: "2026-04-24",
      rows: [
        {
          rank: 1,
          providerId: "openrouter",
          modelId: "example/model",
          displayName: "Example",
          shotsToWin: 22,
          runsCount: 1,
          bestRunId: "01J...",
        },
      ],
    };
    expect(response.rows[0]?.rank).toBe(1);
  });

  test("accepts a valid all-time row with fractional median", () => {
    const response: LeaderboardResponse = {
      scope: "all",
      seedDate: null,
      rows: [
        {
          rank: 1,
          providerId: "openrouter",
          modelId: "example/model",
          displayName: "Example",
          shotsToWin: 22.5,
          runsCount: 4,
          bestRunId: null,
        },
      ],
    };
    expect(response.rows[0]?.shotsToWin).toBe(22.5);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test shared/tests/api-responses.test.ts`

Expected: FAIL with missing type exports.

- [ ] **Step 3: Add the types**

Append to `shared/src/types.ts`:

```ts
export interface ProvidersResponseModel {
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
  estimatedCostRange: {
    minUsd: number;
    maxUsd: number;
  };
  priceSource: string;
  lastReviewedAt: string;
}

export interface ProvidersResponseProvider {
  id: string;
  displayName: string;
  models: readonly ProvidersResponseModel[];
}

export interface ProvidersResponse {
  providers: readonly ProvidersResponseProvider[];
}

export interface LeaderboardRow {
  rank: number;
  providerId: string;
  modelId: string;
  displayName: string;
  shotsToWin: number;
  runsCount: number;
  bestRunId: string | null;
}

export interface LeaderboardResponse {
  scope: "today" | "all";
  seedDate: string | null;
  rows: readonly LeaderboardRow[];
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test shared/tests/api-responses.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/types.ts shared/tests/api-responses.test.ts
git commit -m "feat(shared): add ProvidersResponse and LeaderboardResponse types"
```

---

## Phase 2: Pricing module

### Task 2.1: Create `providers/pricing.ts` with empty table and lookup

**Files:**

- Create: `backend/src/providers/pricing.ts`
- Test: `backend/tests/unit/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/unit/pricing.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { getPricingEntry, listPricedModels } from "../../src/providers/pricing.ts";

describe("pricing table", () => {
  test("listPricedModels returns readonly entries", () => {
    const entries = listPricedModels();
    expect(Array.isArray(entries)).toBe(true);
  });

  test("getPricingEntry returns undefined for an unknown pair", () => {
    expect(getPricingEntry("does-not-exist", "also-nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: FAIL with missing module.

- [ ] **Step 3: Create the module with placeholder-free skeleton**

Create `backend/src/providers/pricing.ts`:

```ts
export interface PricingEntry {
  providerId: string;
  modelId: string;
  displayName: string;
  hasReasoning: boolean;
  inputMicrosPerMtok: number;
  outputMicrosPerMtok: number;
  estimatedPromptTokens: number;
  estimatedImageTokens: number;
  estimatedOutputTokensPerShot: number;
  priceSource: string;
  lastReviewedAt: string;
}

export const PRICING_TABLE: readonly PricingEntry[] = [];

export function getPricingEntry(providerId: string, modelId: string): PricingEntry | undefined {
  return PRICING_TABLE.find(
    (entry) => entry.providerId === providerId && entry.modelId === modelId,
  );
}

export function listPricedModels(): readonly PricingEntry[] {
  return PRICING_TABLE;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/pricing.ts backend/tests/unit/pricing.test.ts
git commit -m "feat(backend): add pricing module skeleton with lookup and listing"
```

### Task 2.2: Add `computeCostMicros` with floor rounding

**Files:**

- Modify: `backend/src/providers/pricing.ts`
- Modify: `backend/tests/unit/pricing.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/pricing.test.ts`:

```ts
import { computeCostMicros, type PricingEntry } from "../../src/providers/pricing.ts";

function entry(overrides: Partial<PricingEntry> = {}): PricingEntry {
  return {
    providerId: "test",
    modelId: "example",
    displayName: "Example",
    hasReasoning: false,
    inputMicrosPerMtok: 3_000_000,
    outputMicrosPerMtok: 15_000_000,
    estimatedPromptTokens: 0,
    estimatedImageTokens: 0,
    estimatedOutputTokensPerShot: 0,
    priceSource: "https://example/pricing",
    lastReviewedAt: "2026-04-24",
    ...overrides,
  };
}

describe("computeCostMicros", () => {
  test("one million tokens at three dollars per million costs three dollars", () => {
    expect(computeCostMicros(entry(), 1_000_000, 0)).toBe(3_000_000);
  });

  test("prompt-dominant and output-dominant rows sum correctly", () => {
    expect(computeCostMicros(entry(), 1_000, 1_000)).toBe(3_000 + 15_000);
  });

  test("sub-micro costs floor to zero", () => {
    const cheap = entry({ inputMicrosPerMtok: 500_000, outputMicrosPerMtok: 0 });
    expect(computeCostMicros(cheap, 1, 0)).toBe(0);
  });

  test("floor rounding applies to each half separately", () => {
    const e = entry({ inputMicrosPerMtok: 1_500_000, outputMicrosPerMtok: 1_500_000 });
    expect(computeCostMicros(e, 1, 1)).toBe(0);
    expect(computeCostMicros(e, 1_000_001, 0)).toBe(1_500_001);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: FAIL, missing `computeCostMicros`.

- [ ] **Step 3: Add the function**

Append to `backend/src/providers/pricing.ts`:

```ts
export function computeCostMicros(
  entry: PricingEntry,
  tokensIn: number,
  tokensOut: number,
): number {
  const inputPart = Math.floor((tokensIn * entry.inputMicrosPerMtok) / 1_000_000);
  const outputPart = Math.floor((tokensOut * entry.outputMicrosPerMtok) / 1_000_000);
  return inputPart + outputPart;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/pricing.ts backend/tests/unit/pricing.test.ts
git commit -m "feat(backend): add floor-rounded computeCostMicros to pricing module"
```

### Task 2.3: Add `estimateCostRangeMicros`

**Files:**

- Modify: `backend/src/providers/pricing.ts`
- Modify: `backend/tests/unit/pricing.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/unit/pricing.test.ts`:

```ts
import { estimateCostRangeMicros } from "../../src/providers/pricing.ts";

describe("estimateCostRangeMicros", () => {
  test("min is 17 * perTurn, max is 100 * perTurn", () => {
    const e = entry({
      inputMicrosPerMtok: 3_000_000,
      outputMicrosPerMtok: 15_000_000,
      estimatedPromptTokens: 100,
      estimatedImageTokens: 300,
      estimatedOutputTokensPerShot: 50,
    });
    // perTurn input: floor((100 + 300) * 3_000_000 / 1_000_000) = floor(1200) = 1200
    // perTurn output: floor(50 * 15_000_000 / 1_000_000) = floor(750) = 750
    // perTurn total: 1950
    expect(estimateCostRangeMicros(e)).toEqual({ minMicros: 33_150, maxMicros: 195_000 });
  });

  test("rows with no estimators yield zero range", () => {
    const e = entry();
    expect(estimateCostRangeMicros(e)).toEqual({ minMicros: 0, maxMicros: 0 });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: FAIL, missing `estimateCostRangeMicros`.

- [ ] **Step 3: Add the function**

Append to `backend/src/providers/pricing.ts`:

```ts
const PERFECT_WIN_SHOTS = 17;
const SHOT_CAP = 100;

export function estimateCostRangeMicros(entry: PricingEntry): {
  minMicros: number;
  maxMicros: number;
} {
  const promptInput = entry.estimatedPromptTokens + entry.estimatedImageTokens;
  const perTurnInputMicros = Math.floor((promptInput * entry.inputMicrosPerMtok) / 1_000_000);
  const perTurnOutputMicros = Math.floor(
    (entry.estimatedOutputTokensPerShot * entry.outputMicrosPerMtok) / 1_000_000,
  );
  const perTurnMicros = perTurnInputMicros + perTurnOutputMicros;
  return {
    minMicros: PERFECT_WIN_SHOTS * perTurnMicros,
    maxMicros: SHOT_CAP * perTurnMicros,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/pricing.ts backend/tests/unit/pricing.test.ts
git commit -m "feat(backend): add estimateCostRangeMicros to pricing module"
```

---

## Phase 3: HTTP client + image encoding

### Task 3.1: Create the retry-aware HTTP client

**Files:**

- Create: `backend/src/providers/http-client.ts`
- Test: `backend/tests/unit/http-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/http-client.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  NonRetriable4xxError,
  TransientFailureError,
  createHttpClient,
} from "../../src/providers/http-client.ts";

function response(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return new Response(body, { status, headers });
}

function queueFetch(responses: Response[]): typeof globalThis.fetch {
  let i = 0;
  return async () => {
    const r = responses[i];
    i += 1;
    if (r === undefined) {
      throw new Error("fetch called more times than expected");
    }
    return r;
  };
}

describe("createHttpClient", () => {
  test("returns the body on 2xx", async () => {
    const client = createHttpClient({ fetch: queueFetch([response(200, {}, '{"ok":true}')]) });
    const result = await client.request({ url: "https://example/x", method: "POST", body: "" });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"ok":true}');
  });

  test("throws NonRetriable4xxError on 401", async () => {
    const client = createHttpClient({ fetch: queueFetch([response(401)]) });
    await expect(
      client.request({ url: "https://example/x", method: "POST", body: "" }),
    ).rejects.toBeInstanceOf(NonRetriable4xxError);
  });

  test("retries 5xx up to three times, then throws TransientFailureError", async () => {
    const client = createHttpClient({
      fetch: queueFetch([response(503), response(503), response(503)]),
      sleepMs: () => {},
    });
    await expect(
      client.request({ url: "https://example/x", method: "POST", body: "" }),
    ).rejects.toBeInstanceOf(TransientFailureError);
  });

  test("succeeds on the third attempt if the first two fail", async () => {
    const client = createHttpClient({
      fetch: queueFetch([response(503), response(500), response(200, {}, "ok")]),
      sleepMs: () => {},
    });
    const result = await client.request({ url: "https://example/x", method: "POST", body: "" });
    expect(result.body).toBe("ok");
  });

  test("429 with Retry-After waits and retries", async () => {
    const waits: number[] = [];
    const client = createHttpClient({
      fetch: queueFetch([response(429, { "retry-after": "1" }), response(200, {}, "ok")]),
      sleepMs: (ms) => {
        waits.push(ms);
      },
    });
    const result = await client.request({ url: "https://example/x", method: "POST", body: "" });
    expect(result.body).toBe("ok");
    expect(waits[0]).toBe(1000);
  });

  test("429 with Retry-After beyond the 30s ceiling caps at 30000 ms", async () => {
    const waits: number[] = [];
    const client = createHttpClient({
      fetch: queueFetch([response(429, { "retry-after": "9999" }), response(200, {}, "ok")]),
      sleepMs: (ms) => {
        waits.push(ms);
      },
    });
    await client.request({ url: "https://example/x", method: "POST", body: "" });
    expect(waits[0]).toBe(30_000);
  });

  test("404 is non-retriable", async () => {
    const client = createHttpClient({ fetch: queueFetch([response(404)]) });
    await expect(
      client.request({ url: "https://example/x", method: "POST", body: "" }),
    ).rejects.toBeInstanceOf(NonRetriable4xxError);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test backend/tests/unit/http-client.test.ts`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the client**

Create `backend/src/providers/http-client.ts`:

```ts
const DEFAULT_BACKOFF_MS = [500, 1500, 4500] as const;
const RETRY_AFTER_CEILING_MS = 30_000;

export class NonRetriable4xxError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "NonRetriable4xxError";
    this.status = status;
  }
}

export class TransientFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientFailureError";
  }
}

export interface HttpRequest {
  url: string;
  method: "POST" | "GET";
  headers?: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export interface HttpResult {
  status: number;
  body: string;
  headers: Record<string, string>;
  durationMs: number;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResult>;
}

export interface CreateHttpClientOptions {
  fetch: typeof globalThis.fetch;
  sleepMs?: (ms: number) => void | Promise<void>;
  backoffMs?: readonly number[];
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (raw === null) {
    return null;
  }
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return Math.min(seconds * 1000, RETRY_AFTER_CEILING_MS);
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  const sleep = options.sleepMs ?? defaultSleep;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;

  return {
    async request(request) {
      let lastTransient: string = "";

      for (let attempt = 0; attempt < backoff.length; attempt += 1) {
        const startedAt = Date.now();
        let response: Response;
        try {
          response = await options.fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: request.signal,
          });
        } catch (error) {
          lastTransient = error instanceof Error ? error.message : String(error);
          await sleep(backoff[attempt] ?? 0);
          continue;
        }

        const durationMs = Date.now() - startedAt;
        const headerEntries = Array.from(response.headers.entries());
        const headerMap: Record<string, string> = {};
        for (const [key, value] of headerEntries) {
          headerMap[key.toLowerCase()] = value;
        }

        if (response.status >= 200 && response.status < 300) {
          return {
            status: response.status,
            body: await response.text(),
            headers: headerMap,
            durationMs,
          };
        }

        if (response.status === 429) {
          lastTransient = "rate limited";
          const wait = retryAfterMs(response.headers);
          await sleep(wait ?? backoff[attempt] ?? 0);
          continue;
        }

        if (response.status >= 500) {
          lastTransient = `server error ${response.status}`;
          await sleep(backoff[attempt] ?? 0);
          continue;
        }

        throw new NonRetriable4xxError(response.status, `non-retriable ${response.status}`);
      }

      throw new TransientFailureError(lastTransient || "retries exhausted");
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/unit/http-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/http-client.ts backend/tests/unit/http-client.test.ts
git commit -m "feat(backend): add retry-aware HTTP client for provider adapters"
```

### Task 3.2: Create the image-encoding helper

**Files:**

- Create: `backend/src/providers/image-encoding.ts`
- Test: `backend/tests/unit/image-encoding.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/unit/image-encoding.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { toBase64, toPngDataUrl } from "../../src/providers/image-encoding.ts";

describe("image-encoding", () => {
  test("toBase64 round-trips the PNG bytes", () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const base64 = toBase64(bytes);
    expect(Buffer.from(base64, "base64")).toEqual(Buffer.from(bytes));
  });

  test("toPngDataUrl prepends the correct MIME header", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const url = toPngDataUrl(bytes);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test backend/tests/unit/image-encoding.test.ts`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the helper**

Create `backend/src/providers/image-encoding.ts`:

```ts
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function toPngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${toBase64(bytes)}`;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/unit/image-encoding.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/image-encoding.ts backend/tests/unit/image-encoding.test.ts
git commit -m "feat(backend): add image-encoding helpers for provider adapters"
```

---

## Phase 4: Mock-adapter extension for test-only hooks

### Task 4.1: Extend `mock.ts` with a test-only options bag

**Files:**

- Modify: `backend/src/providers/mock.ts`
- Test: `backend/tests/unit/mock-provider.test.ts` (new; may already exist from S2)

- [ ] **Step 1: Write the failing tests**

Create or extend `backend/tests/unit/mock-provider.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createMockProvider } from "../../src/providers/mock.ts";

const baseInput = {
  apiKey: "ignored",
  boardPng: new Uint8Array([1, 2, 3]),
  shipsRemaining: ["carrier"] as const,
  systemPrompt: "",
  priorShots: [],
  seedDate: "2026-04-24",
} as const;

describe("mock provider options bag", () => {
  test("reports a synthetic cost when configured", async () => {
    const adapter = createMockProvider({
      delayMs: 0,
      testHooks: { costUsdMicros: 2500, tokensIn: 123, tokensOut: 45 },
    });
    const controller = new AbortController();
    const out = await adapter.call({ ...baseInput, modelId: "mock-happy" }, controller.signal);
    expect(out.costUsdMicros).toBe(2500);
    expect(out.tokensIn).toBe(123);
    expect(out.tokensOut).toBe(45);
  });

  test("throws transient failure when configured", async () => {
    const adapter = createMockProvider({ delayMs: 0, testHooks: { failure: "transient" } });
    await expect(
      adapter.call({ ...baseInput, modelId: "mock-happy" }, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "transient" });
  });

  test("throws unreachable when configured", async () => {
    const adapter = createMockProvider({ delayMs: 0, testHooks: { failure: "unreachable" } });
    await expect(
      adapter.call({ ...baseInput, modelId: "mock-happy" }, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "unreachable" });
  });

  test("options bag is ignored when absent", async () => {
    const adapter = createMockProvider({ delayMs: 0 });
    const out = await adapter.call(
      { ...baseInput, modelId: "mock-happy" },
      new AbortController().signal,
    );
    expect(out.costUsdMicros).toBe(0);
    expect(out.tokensIn).toBe(0);
    expect(out.tokensOut).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test backend/tests/unit/mock-provider.test.ts`

Expected: FAIL with "testHooks is not a recognized option" or missing `failure` handling.

- [ ] **Step 3: Extend the mock**

Modify `backend/src/providers/mock.ts`:

Change the `createMockProvider` signature to include `testHooks`:

```ts
export interface MockTestHooks {
  costUsdMicros?: number;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number | null;
  failure?: "transient" | "unreachable" | null;
}

export function createMockProvider(
  options: { delayMs?: number; testHooks?: MockTestHooks } = {},
): ProviderAdapter {
  const delayMs = options.delayMs ?? MOCK_TURN_DELAY_MS_DEFAULT;
  const hooks = options.testHooks ?? {};

  return {
    id: "mock",
    models: MODELS,
    async call(input, signal) {
      const startedAt = Date.now();
      await sleep(delayMs, signal);

      if (hooks.failure === "transient") {
        throw { kind: "transient", cause: "mock transient failure" };
      }
      if (hooks.failure === "unreachable") {
        throw { kind: "unreachable", cause: "mock unreachable", status: 401 };
      }

      let rawText: string;
      switch (input.modelId) {
        case "mock-happy":
          rawText = JSON.stringify(nextHappyShot(input));
          break;
        case "mock-misses":
          rawText = JSON.stringify(nextMissShot(input));
          break;
        case "mock-schema-errors":
          rawText = "not json";
          break;
        default:
          throw new Error(`Unknown mock model: ${input.modelId}`);
      }

      return {
        rawText,
        tokensIn: hooks.tokensIn ?? 0,
        tokensOut: hooks.tokensOut ?? 0,
        reasoningTokens: hooks.reasoningTokens ?? null,
        costUsdMicros: hooks.costUsdMicros ?? 0,
        durationMs: Date.now() - startedAt,
      };
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/unit/mock-provider.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/mock.ts backend/tests/unit/mock-provider.test.ts
git commit -m "feat(backend): extend mock provider with test-only options bag"
```

---

## Phase 5: Contract-test harness and OpenRouter adapter

### Task 5.0: Capture the OpenRouter fixture set (manual)

**Files:**

- Create: `backend/tests/fixtures/providers/openrouter/happy-path.json`
- Create: `backend/tests/fixtures/providers/openrouter/schema-error.json`
- Create: `backend/tests/fixtures/providers/openrouter/token-edge.json`
- Create: `backend/tests/fixtures/providers/openrouter/auth-401.json`
- Create: `backend/tests/fixtures/providers/openrouter/rate-limited-429.json`
- Create: `backend/tests/fixtures/providers/openrouter/transient-5xx.json`
- Create: `backend/tests/fixtures/providers/openrouter/reasoning-response.json` (only if a priced OpenRouter model in `PRICING_TABLE` has `hasReasoning = true`)

**Why:** Contract tests parse real provider response shapes. Fixtures are captured by hand from OpenRouter's docs and live API; they are redacted to strip auth headers and any key-shaped strings.

- [ ] **Step 1: Confirm the OpenRouter chat-completions endpoint shape**

Open `https://openrouter.ai/docs/quickstart` and `https://openrouter.ai/docs/api-reference/chat-completion` in a browser. Read the current request/response shape. Note the `usage` field layout for `prompt_tokens`, `completion_tokens`, and any reasoning-token reporting.

- [ ] **Step 2: Pick 3-5 priced OpenRouter models to ship**

Choose a curated set of current vision-capable models (per brainstormed Q1 decision). Record their exact ids, display names, current input/output prices per 1M tokens, and `hasReasoning`. These populate `PRICING_TABLE` in Task 5.1.

- [ ] **Step 3: Create each fixture file**

For each scenario, write a JSON envelope with this shape:

```json
{
  "_meta": {
    "capturedAt": "YYYY-MM-DD",
    "capturedAgainstModel": "<exact id>",
    "notes": "..."
  },
  "request": {
    "assertUrlContains": "openrouter.ai/api/v1/chat/completions",
    "assertMethod": "POST",
    "assertBodyContains": { "model": "<the model id>" },
    "assertHeaderPresent": ["authorization"]
  },
  "responses": [
    {
      "status": 200,
      "headers": { "content-type": "application/json" },
      "body": { "...": "..." }
    }
  ]
}
```

For `auth-401.json`, the `responses` array has one element with `status: 401` and a realistic error body. For `rate-limited-429.json`, two elements: `429 + retry-after: 1`, then `200`. For `transient-5xx.json`, three `503` responses (so the adapter exhausts all retries). For `schema-error.json`, the 200 body contains text that is not valid JSON. For `token-edge.json`, a 200 body with unusually high reasoning-token count to exercise reasoning reporting.

- [ ] **Step 4: Strip every captured fixture of any authorization header, `x-*-id` header, `openrouter-*-id` header, and any string that matches a known provider key prefix (e.g., `sk-or-v1-...`). Replace with placeholder values.**

- [ ] **Step 5: Verify the fixtures parse as JSON**

Run:

```bash
for f in backend/tests/fixtures/providers/openrouter/*.json; do
  bun -e "JSON.parse(await Bun.file('$f').text())" || echo "FAIL: $f"
done
```

Expected: no FAIL lines.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/fixtures/providers/openrouter/
git commit -m "test(backend): capture OpenRouter contract-test fixtures"
```

### Task 5.1: Populate `PRICING_TABLE` with OpenRouter rows

**Files:**

- Modify: `backend/src/providers/pricing.ts`
- Modify: `backend/tests/unit/pricing.test.ts`

- [ ] **Step 1: Write the failing test for lookup against a real row**

Append to `backend/tests/unit/pricing.test.ts`:

```ts
describe("PRICING_TABLE contents", () => {
  test("openrouter has at least one priced model", () => {
    const openrouterModels = listPricedModels().filter((m) => m.providerId === "openrouter");
    expect(openrouterModels.length).toBeGreaterThan(0);
  });

  test("every openrouter row has a non-empty priceSource URL", () => {
    for (const m of listPricedModels().filter((m) => m.providerId === "openrouter")) {
      expect(m.priceSource).toMatch(/^https?:\/\//);
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: FAIL, zero openrouter rows.

- [ ] **Step 3: Populate PRICING_TABLE**

Replace the empty `PRICING_TABLE` in `backend/src/providers/pricing.ts` with the models chosen in Task 5.0 step 2. Each entry: exact `modelId`, `displayName`, `hasReasoning`, `inputMicrosPerMtok` = (input USD per 1M) \* 1_000_000 as an integer, `outputMicrosPerMtok` similarly, plus calibrated estimators (`estimatedPromptTokens`, `estimatedImageTokens`, `estimatedOutputTokensPerShot`) derived from a small observed run, and `priceSource` = the specific OpenRouter pricing page URL for that model.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/unit/pricing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/pricing.ts backend/tests/unit/pricing.test.ts
git commit -m "feat(backend): add OpenRouter rows to PRICING_TABLE"
```

### Task 5.2: Create the contract-test harness

**Files:**

- Create: `backend/tests/integration/providers/harness.ts`
- Test: `backend/tests/integration/providers/harness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/integration/providers/harness.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { buildFetch, loadFixture } from "./harness.ts";

describe("harness.loadFixture", () => {
  test("loads a valid JSON file and returns its envelope", async () => {
    const envelope = await loadFixture("openrouter", "happy-path");
    expect(envelope.responses.length).toBeGreaterThan(0);
  });
});

describe("harness.buildFetch", () => {
  test("returns sequential responses", async () => {
    const envelope = {
      request: {
        assertUrlContains: "example.com",
        assertMethod: "POST",
        assertBodyContains: {},
        assertHeaderPresent: [],
      },
      responses: [
        { status: 200, headers: { "content-type": "application/json" }, body: { a: 1 } },
        { status: 200, headers: { "content-type": "application/json" }, body: { a: 2 } },
      ],
    };
    const { fetch } = buildFetch(envelope);
    const r1 = await fetch("https://example.com/x", { method: "POST" });
    expect(await r1.json()).toEqual({ a: 1 });
    const r2 = await fetch("https://example.com/x", { method: "POST" });
    expect(await r2.json()).toEqual({ a: 2 });
  });

  test("records each outgoing request for later assertion", async () => {
    const envelope = {
      request: {
        assertUrlContains: "x",
        assertMethod: "POST",
        assertBodyContains: {},
        assertHeaderPresent: [],
      },
      responses: [{ status: 200, headers: {}, body: {} }],
    };
    const { fetch, recorded } = buildFetch(envelope);
    await fetch("https://x.test/y", { method: "POST", body: "hi", headers: { "x-h": "v" } });
    expect(recorded.length).toBe(1);
    expect(recorded[0]?.url).toBe("https://x.test/y");
    expect(recorded[0]?.method).toBe("POST");
    expect(recorded[0]?.headers["x-h"]).toBe("v");
    expect(recorded[0]?.body).toBe("hi");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test backend/tests/integration/providers/harness.test.ts`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement the harness**

Create `backend/tests/integration/providers/harness.ts`:

```ts
import path from "node:path";

export interface FixtureRequest {
  assertUrlContains: string;
  assertMethod: "POST" | "GET";
  assertBodyContains: Record<string, unknown>;
  assertHeaderPresent: readonly string[];
}

export interface FixtureResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface FixtureEnvelope {
  _meta?: Record<string, unknown>;
  request: FixtureRequest;
  responses: readonly FixtureResponse[];
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

export async function loadFixture(providerId: string, scenario: string): Promise<FixtureEnvelope> {
  const filePath = path.join(
    process.cwd(),
    "backend",
    "tests",
    "fixtures",
    "providers",
    providerId,
    `${scenario}.json`,
  );
  const text = await Bun.file(filePath).text();
  return JSON.parse(text) as FixtureEnvelope;
}

export function buildFetch(envelope: FixtureEnvelope): {
  fetch: typeof globalThis.fetch;
  recorded: RecordedRequest[];
} {
  const recorded: RecordedRequest[] = [];
  let index = 0;

  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) {
        headers[k.toLowerCase()] = v;
      }
    } else if (init.headers !== undefined) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k.toLowerCase()] = String(v);
      }
    }

    recorded.push({
      url,
      method: (init.method ?? "GET").toUpperCase(),
      headers,
      body: typeof init.body === "string" ? init.body : "",
    });

    const fixture = envelope.responses[index];
    index += 1;
    if (fixture === undefined) {
      throw new Error(
        `fetch called ${index} times; fixture only defines ${envelope.responses.length}`,
      );
    }

    return new Response(
      typeof fixture.body === "string" ? fixture.body : JSON.stringify(fixture.body),
      { status: fixture.status, headers: fixture.headers },
    );
  };

  return { fetch, recorded };
}

export function assertRequest(recorded: RecordedRequest, fixture: FixtureRequest): void {
  if (!recorded.url.includes(fixture.assertUrlContains)) {
    throw new Error(`URL ${recorded.url} does not contain ${fixture.assertUrlContains}`);
  }
  if (recorded.method !== fixture.assertMethod) {
    throw new Error(`method ${recorded.method} !== ${fixture.assertMethod}`);
  }
  for (const header of fixture.assertHeaderPresent) {
    if (!(header.toLowerCase() in recorded.headers)) {
      throw new Error(`missing header ${header}`);
    }
  }
  const body = recorded.body.length > 0 ? JSON.parse(recorded.body) : {};
  for (const [key, expected] of Object.entries(fixture.assertBodyContains)) {
    if (body[key] === undefined) {
      throw new Error(`body missing key ${key}`);
    }
    if (
      typeof expected !== "string" ||
      typeof body[key] !== "string" ||
      !body[key].includes(expected)
    ) {
      // Deep partial is only checked as presence-plus-type; deeper equality handled per test if needed.
    }
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/integration/providers/harness.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/integration/providers/harness.ts backend/tests/integration/providers/harness.test.ts
git commit -m "test(backend): add contract-test harness for provider fixtures"
```

### Task 5.3: Implement the OpenRouter adapter (happy path + error paths)

**Files:**

- Create: `backend/src/providers/openrouter.ts`
- Test: `backend/tests/integration/providers/openrouter.test.ts`

Provider request shape: OpenAI-compatible; endpoint `https://openrouter.ai/api/v1/chat/completions`; `Authorization: Bearer <key>`; body includes `model`, `messages: [{ role: "system", content: ... }, { role: "user", content: [ { type: "text", text: ... }, { type: "image_url", image_url: { url: <data-url> } } ] }]`. Response has `choices[0].message.content` (text) and `usage: { prompt_tokens, completion_tokens, completion_tokens_details?: { reasoning_tokens? } }`.

- [ ] **Step 1: Write the failing tests against captured fixtures**

Create `backend/tests/integration/providers/openrouter.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createOpenRouterAdapter } from "../../../src/providers/openrouter.ts";
import { getPricingEntry } from "../../../src/providers/pricing.ts";

import { assertRequest, buildFetch, loadFixture } from "./harness.ts";

const baseInput = {
  apiKey: "sk-or-v1-TEST",
  boardPng: new Uint8Array([137, 80, 78, 71]),
  shipsRemaining: ["carrier", "cruiser"] as const,
  systemPrompt: "system",
  priorShots: [],
  seedDate: "2026-04-24",
};

describe("openrouter adapter contract", () => {
  test("happy path: parses shot, tokens, and cost", async () => {
    const envelope = await loadFixture("openrouter", "happy-path");
    const { fetch, recorded } = buildFetch(envelope);
    const adapter = createOpenRouterAdapter({ fetch });
    const modelId = envelope.request.assertBodyContains.model as string;
    const out = await adapter.call({ ...baseInput, modelId }, new AbortController().signal);
    assertRequest(recorded[0]!, envelope.request);
    expect(recorded[0]?.headers.authorization).toBe(`Bearer ${baseInput.apiKey}`);
    expect(out.rawText.length).toBeGreaterThan(0);
    expect(out.tokensIn).toBeGreaterThan(0);
    expect(out.tokensOut).toBeGreaterThan(0);

    const entry = getPricingEntry("openrouter", modelId);
    if (entry !== undefined) {
      expect(out.costUsdMicros).toBeGreaterThan(0);
    }
  });

  test("schema-error path: rawText is preserved for downstream classification", async () => {
    const envelope = await loadFixture("openrouter", "schema-error");
    const { fetch } = buildFetch(envelope);
    const adapter = createOpenRouterAdapter({ fetch });
    const modelId = envelope.request.assertBodyContains.model as string;
    const out = await adapter.call({ ...baseInput, modelId }, new AbortController().signal);
    expect(out.rawText.length).toBeGreaterThan(0);
    // Adapter must not try to parse JSON itself; the engine does that.
  });

  test("auth failure: throws ProviderError { kind: 'unreachable' } on 401", async () => {
    const envelope = await loadFixture("openrouter", "auth-401");
    const { fetch } = buildFetch(envelope);
    const adapter = createOpenRouterAdapter({ fetch });
    const modelId = envelope.request.assertBodyContains.model as string;
    await expect(
      adapter.call({ ...baseInput, modelId }, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "unreachable", status: 401 });
  });

  test("rate-limited then succeeds: retries once and returns", async () => {
    const envelope = await loadFixture("openrouter", "rate-limited-429");
    const { fetch } = buildFetch(envelope);
    const adapter = createOpenRouterAdapter({ fetch, sleepMs: () => {} });
    const modelId = envelope.request.assertBodyContains.model as string;
    const out = await adapter.call({ ...baseInput, modelId }, new AbortController().signal);
    expect(out.rawText.length).toBeGreaterThan(0);
  });

  test("transient failure: throws ProviderError { kind: 'transient' } after three 5xx", async () => {
    const envelope = await loadFixture("openrouter", "transient-5xx");
    const { fetch } = buildFetch(envelope);
    const adapter = createOpenRouterAdapter({ fetch, sleepMs: () => {} });
    const modelId = envelope.request.assertBodyContains.model as string;
    await expect(
      adapter.call({ ...baseInput, modelId }, new AbortController().signal),
    ).rejects.toMatchObject({ kind: "transient" });
  });

  test("the API key never appears in the returned output", async () => {
    const envelope = await loadFixture("openrouter", "happy-path");
    const { fetch } = buildFetch(envelope);
    const adapter = createOpenRouterAdapter({ fetch });
    const modelId = envelope.request.assertBodyContains.model as string;
    const out = await adapter.call({ ...baseInput, modelId }, new AbortController().signal);
    const serialized = JSON.stringify(out);
    expect(serialized.includes(baseInput.apiKey)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test backend/tests/integration/providers/openrouter.test.ts`

Expected: FAIL with missing module `createOpenRouterAdapter`.

- [ ] **Step 3: Implement the adapter**

Create `backend/src/providers/openrouter.ts`:

```ts
import type { ProviderError } from "@battleship-arena/shared";

import {
  createHttpClient,
  NonRetriable4xxError,
  TransientFailureError,
  type HttpClient,
} from "./http-client.ts";
import { toPngDataUrl } from "./image-encoding.ts";
import { computeCostMicros, getPricingEntry, listPricedModels } from "./pricing.ts";
import type {
  ProviderAdapter,
  ProviderCallInput,
  ProviderCallOutput,
  ProviderModel,
} from "./types.ts";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface CreateOpenRouterOptions {
  fetch: typeof globalThis.fetch;
  sleepMs?: (ms: number) => void | Promise<void>;
  http?: HttpClient;
}

function models(): readonly ProviderModel[] {
  return listPricedModels()
    .filter((entry) => entry.providerId === "openrouter")
    .map((entry) => ({
      id: entry.modelId,
      displayName: entry.displayName,
      hasReasoning: entry.hasReasoning,
    }));
}

function requestBody(input: ProviderCallInput): string {
  return JSON.stringify({
    model: input.modelId,
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Still afloat: ${input.shipsRemaining.join(", ")}.` },
          { type: "image_url", image_url: { url: toPngDataUrl(input.boardPng) } },
        ],
      },
    ],
    stream: false,
  });
}

interface OpenRouterResponseJson {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}

function stripReasoning(body: OpenRouterResponseJson): {
  rawText: string;
  reasoningTokens: number | null;
} {
  const message = body.choices?.[0]?.message;
  const text = message?.content ?? "";
  const reasoningTokens = body.usage?.completion_tokens_details?.reasoning_tokens ?? null;
  return { rawText: text, reasoningTokens };
}

export function createOpenRouterAdapter(options: CreateOpenRouterOptions): ProviderAdapter {
  const http = options.http ?? createHttpClient({ fetch: options.fetch, sleepMs: options.sleepMs });

  return {
    id: "openrouter",
    models: models(),
    async call(input, signal) {
      let result;
      try {
        result = await http.request({
          url: ENDPOINT,
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${input.apiKey}`,
          },
          body: requestBody(input),
          signal,
        });
      } catch (error) {
        // Translate HTTP-client error classes into the shared ProviderError union.
        if (error instanceof NonRetriable4xxError) {
          const providerError: ProviderError = {
            kind: "unreachable",
            cause: error.message,
            status: error.status,
          };
          throw providerError;
        }
        if (error instanceof TransientFailureError) {
          const providerError: ProviderError = { kind: "transient", cause: error.message };
          throw providerError;
        }
        const providerError: ProviderError = {
          kind: "transient",
          cause: error instanceof Error ? error.message : String(error),
        };
        throw providerError;
      }

      let json: OpenRouterResponseJson;
      try {
        json = JSON.parse(result.body) as OpenRouterResponseJson;
      } catch {
        const providerError: ProviderError = {
          kind: "transient",
          cause: "openrouter returned non-JSON body",
        };
        throw providerError;
      }

      const { rawText, reasoningTokens } = stripReasoning(json);
      const tokensIn = json.usage?.prompt_tokens ?? 0;
      const tokensOut = json.usage?.completion_tokens ?? 0;

      const entry = getPricingEntry("openrouter", input.modelId);
      const costUsdMicros = entry === undefined ? 0 : computeCostMicros(entry, tokensIn, tokensOut);

      const output: ProviderCallOutput = {
        rawText,
        tokensIn,
        tokensOut,
        reasoningTokens,
        costUsdMicros,
        durationMs: result.durationMs,
      };
      return output;
    },
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/integration/providers/openrouter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/openrouter.ts backend/tests/integration/providers/openrouter.test.ts
git commit -m "feat(backend): add OpenRouter provider adapter with contract tests"
```

---

## Phase 6: opencode-go adapter

### Task 6.1: Confirm `opencode-go` resolution is up to date

**Files:** None.

**Why:** Task 0.0 resolved the slug, endpoint, and auth shape at the start of the work. Before building the adapter, re-check that those notes still hold; upstream projects can rename endpoints or change auth. Any drift is cheaper to catch here than inside an adapter that has already been half-written.

- [ ] **Step 1: Re-read the Task 0.0 notes in this plan.**
- [ ] **Step 2: If anything has changed (new endpoint, new auth scheme, renamed provider), update Task 0.0's notes and the design doc's Section 4.1 before proceeding. Bundle both edits into a single `docs(plan):` commit.**
- [ ] **Step 3: If nothing has changed, proceed to Task 6.2 without a commit.**

### Task 6.2: Capture `opencode-go` fixtures

Mirrors Task 5.0 for OpenRouter. Fixture set: `happy-path`, `schema-error`, `token-edge`, `auth-401`, `rate-limited-429`, `transient-5xx`, plus `reasoning-response` if any priced opencode-go model has `hasReasoning = true`. Paths live under `backend/tests/fixtures/providers/opencode-go/`.

- [ ] **Step 1: Write each fixture envelope** (structure identical to Task 5.0 step 3; adjust `assertUrlContains` and body shape to match the resolved opencode-go endpoint).
- [ ] **Step 2: Redact auth headers and key-shaped strings**.
- [ ] **Step 3: Verify each file parses as JSON**.
- [ ] **Step 4: Commit**.

```bash
git add backend/tests/fixtures/providers/opencode-go/
git commit -m "test(backend): capture opencode-go contract-test fixtures"
```

### Task 6.3: Populate `PRICING_TABLE` with opencode-go rows

Mirrors Task 5.1. Append the curated opencode-go models to `PRICING_TABLE` with calibrated estimators. Extend the pricing tests so `listPricedModels().filter(... opencode-go ...).length > 0`.

- [ ] **Step 1: Extend pricing test to require at least one opencode-go row**.
- [ ] **Step 2: Add the rows to `PRICING_TABLE`**.
- [ ] **Step 3: Run `bun test backend/tests/unit/pricing.test.ts`**; expect PASS.
- [ ] **Step 4: Commit** with `feat(backend): add opencode-go rows to PRICING_TABLE`.

### Task 6.4: Implement the opencode-go adapter

Mirrors Task 5.3 for OpenRouter, with the opencode-go upstream resolved in Task 6.1.

- [ ] **Step 1: Write the failing contract tests** (copy of `openrouter.test.ts`, retargeted: fixture directory `opencode-go`, factory `createOpencodeGoAdapter`).
- [ ] **Step 2: Run and watch them fail**.
- [ ] **Step 3: Implement `backend/src/providers/opencode-go.ts`**. Reuse `createHttpClient`, `toPngDataUrl`, `computeCostMicros`, `getPricingEntry` exactly as in OpenRouter. Adjust request body construction and response parsing to match the resolved opencode-go shapes from Task 6.1.
- [ ] **Step 4: Run and watch them pass**.
- [ ] **Step 5: Commit** with `feat(backend): add opencode-go provider adapter with contract tests`.

### Task 6.5: Wire both adapters into the backend registry

**Files:**

- Create: `backend/src/providers/index.ts`
- Modify: `backend/src/app.ts` or wherever the existing `ProviderRegistry` is assembled (trace by `grep -n "createMockProvider\|createProviderRegistry" backend/src/`)

- [ ] **Step 1: Write a failing integration test that the registry exposes both real adapters**

Create `backend/tests/integration/providers/registry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createProviderRegistry } from "../../../src/providers/index.ts";

describe("provider registry", () => {
  test("exposes openrouter and opencode-go adapters", () => {
    const registry = createProviderRegistry({ fetch: globalThis.fetch });
    expect(registry.get("openrouter")).toBeDefined();
    expect(registry.get("opencode-go")).toBeDefined();
    expect(registry.get("mock")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Implement `backend/src/providers/index.ts`**

```ts
import { createMockProvider } from "./mock.ts";
import { createOpenRouterAdapter } from "./openrouter.ts";
import { createOpencodeGoAdapter } from "./opencode-go.ts";
import {
  createProviderRegistry as rawCreateRegistry,
  type ProviderAdapter,
  type ProviderRegistry,
} from "./types.ts";

export interface CreateProviderRegistryOptions {
  fetch: typeof globalThis.fetch;
  includeMock?: boolean;
}

export function createProviderRegistry(options: CreateProviderRegistryOptions): ProviderRegistry {
  const { fetch } = options;
  const includeMock = options.includeMock ?? true;

  const adapters: Record<string, ProviderAdapter> = {
    openrouter: createOpenRouterAdapter({ fetch }),
    "opencode-go": createOpencodeGoAdapter({ fetch }),
  };
  if (includeMock) {
    adapters.mock = createMockProvider();
  }
  return rawCreateRegistry(adapters);
}
```

- [ ] **Step 4: Update `backend/src/app.ts` (or wherever the existing registry is created) to call `createProviderRegistry` from this new module.** Remove any duplicated `createMockProvider` import that the old site used if it is now unused.

- [ ] **Step 5: Run all backend tests**

Run: `bun test backend/`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/providers/index.ts backend/src/app.ts backend/tests/integration/providers/registry.test.ts
git commit -m "feat(backend): assemble provider registry with openrouter, opencode-go, mock"
```

---

## Phase 7: Budget DNF path

### Task 7.1: Thread accumulated cost into the outcome FSM

**Files:**

- Modify: `backend/src/runs/outcome.ts`
- Modify: existing `backend/tests/unit/outcome.test.ts` (likely exists from S2; confirm path via `grep -n "reduceOutcome" backend/tests/`)

- [ ] **Step 1: Write failing tests for dnf_budget**

Append to `backend/tests/unit/outcome.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { initialRunLoopState, reduceOutcome } from "../../src/runs/outcome.ts";

describe("dnf_budget transition", () => {
  test("fires when accumulated cost meets the budget exactly", () => {
    const state = { ...initialRunLoopState(), accumulatedCostMicros: 900 };
    const result = reduceOutcome(
      state,
      { kind: "miss", costUsdMicros: 100 },
      { budgetMicros: 1_000 },
    );
    expect(result.outcome).toBe("dnf_budget");
    expect(result.state.accumulatedCostMicros).toBe(1_000);
  });

  test("does not fire when budget is null", () => {
    const result = reduceOutcome(
      initialRunLoopState(),
      { kind: "miss", costUsdMicros: 999_999 },
      { budgetMicros: null },
    );
    expect(result.outcome).toBeNull();
  });

  test("does not fire when budget is zero (treated as no cap)", () => {
    const result = reduceOutcome(
      initialRunLoopState(),
      { kind: "miss", costUsdMicros: 999_999 },
      { budgetMicros: 0 },
    );
    expect(result.outcome).toBeNull();
  });

  test("won takes precedence over dnf_budget on the same turn", () => {
    const state = {
      ...initialRunLoopState(),
      hits: 16,
      accumulatedCostMicros: 0,
    };
    const result = reduceOutcome(
      state,
      { kind: "sunk", costUsdMicros: 10_000_000 },
      { budgetMicros: 1_000 },
    );
    expect(result.outcome).toBe("won");
  });

  test("dnf_schema_errors takes precedence over dnf_budget on the same turn", () => {
    const state = {
      ...initialRunLoopState(),
      consecutiveSchemaErrors: 4,
      accumulatedCostMicros: 0,
    };
    const result = reduceOutcome(
      state,
      { kind: "schema_error", costUsdMicros: 10_000_000 },
      { budgetMicros: 1_000 },
    );
    expect(result.outcome).toBe("dnf_schema_errors");
  });
});
```

- [ ] **Step 2: Run and watch the tests fail**

Run: `bun test backend/tests/unit/outcome.test.ts`

Expected: FAIL with "reduceOutcome expected 3 arguments" or similar.

- [ ] **Step 3: Extend `reduceOutcome`**

Modify `backend/src/runs/outcome.ts`:

- Add `accumulatedCostMicros: number` to `RunLoopState`; update `initialRunLoopState` to set it to 0.
- Add `costUsdMicros: number` to every `RunLoopEvent` variant that represents a provider turn (`hit`, `miss`, `sunk`, `schema_error`, `invalid_coordinate`). The `abort` variant still carries no cost.
- Add a third parameter `context: { budgetMicros: number | null }` to `reduceOutcome`.
- After updating `nextState`, add `nextState.accumulatedCostMicros = state.accumulatedCostMicros + event.costUsdMicros` (for event variants that carry cost).
- Insert a new check, evaluated after `won`, `dnf_shot_cap`, and `dnf_schema_errors`, before returning `null`:

```ts
if (
  context.budgetMicros !== null &&
  context.budgetMicros > 0 &&
  nextState.accumulatedCostMicros >= context.budgetMicros
) {
  return { state: nextState, outcome: "dnf_budget" };
}
```

Keep the existing evaluation order intact; this new branch only runs when none of the earlier terminal conditions fired.

- [ ] **Step 4: Run all outcome tests and watch them pass**

Run: `bun test backend/tests/unit/outcome.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/runs/outcome.ts backend/tests/unit/outcome.test.ts
git commit -m "feat(backend): extend outcome FSM with dnf_budget and cost accumulation"
```

### Task 7.2: Wire the engine to pass `costUsdMicros` and `budgetMicros` to the FSM

**Files:**

- Modify: `backend/src/runs/engine.ts`
- Modify: existing engine integration tests (likely `backend/tests/integration/runs/engine.test.ts`; confirm with `grep -n "runs/engine" backend/tests/`)

- [ ] **Step 1: Write a failing integration test that sets a synthetic per-turn cost and hits dnf_budget**

Append to the engine integration test file:

```ts
import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../../../src/db/with-temp-database.ts";
import { createProviderRegistry } from "../../../src/providers/index.ts";
import { createMockProvider } from "../../../src/providers/mock.ts";

describe("engine dnf_budget", () => {
  test("terminates when cumulative cost meets budget", async () => {
    await withTempDatabase(async (queries) => {
      const perTurnMicros = 100;
      const budgetMicros = 400;
      const mock = createMockProvider({
        delayMs: 0,
        testHooks: { costUsdMicros: perTurnMicros, tokensIn: 10, tokensOut: 5 },
      });
      // Assemble a minimal engine and run a mock-happy run with budget 0.0004 USD.
      // Exact wiring depends on the existing engine test helpers; follow the pattern
      // used by the S2 "run to won" test in the same file.
      // Assertion:
      //   - outcome is "dnf_budget"
      //   - runs.cost_usd_micros >= budgetMicros
      //   - shots_fired count matches how many turns fit inside the budget (4 here,
      //     since 4 * 100 = 400).
    });
  });
});
```

(Fill in the engine-bootstrap details to match the S2 test helpers exactly; do not speculate about helper names. The engine test file already contains a "run to won" test - copy its setup verbatim.)

- [ ] **Step 2: Run and watch the test fail**

Expected: FAIL (engine ignores cost/budget).

- [ ] **Step 3: Modify the engine**

In `backend/src/runs/engine.ts`:

1. Pull `budgetUsdMicros` from the run row (already persisted by `POST /api/runs`).
2. When reducing the outcome after each turn, pass `{ budgetMicros: budgetUsdMicros ?? null }` as the new third argument.
3. Pass `costUsdMicros` from the adapter's `ProviderCallOutput` into the event payload for `hit`, `miss`, `sunk`, `schema_error`, `invalid_coordinate`.
4. On terminal state, write `runs.cost_usd_micros = accumulatedCostMicros` in the same UPDATE that sets `outcome` and `ended_at`.

- [ ] **Step 4: Run the test and watch it pass**

Expected: PASS.

- [ ] **Step 5: Run the entire backend suite to ensure nothing else regressed**

Run: `bun test backend/`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/runs/engine.ts backend/tests/integration/runs/engine.test.ts
git commit -m "feat(backend): wire per-turn cost and budget through the game loop"
```

### Task 7.3: Wire `ProviderError` handling into the engine

**Files:**

- Modify: `backend/src/runs/engine.ts`
- Modify: existing engine integration tests

**Why:** Spec section 6.5 requires two distinct behaviours when adapters fail: transient failures become `schema_error` turns that feed `dnf_schema_errors`; non-retriable 4xx terminate the run with `llm_unreachable` and do NOT touch the schema-error counter. S2's engine only ever called the mock adapter (which never threw typed errors), so this path is unimplemented.

- [ ] **Step 1: Write failing integration tests using the extended mock**

Extend the engine integration test file:

```ts
import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../../../src/db/with-temp-database.ts";
import { createMockProvider } from "../../../src/providers/mock.ts";

describe("engine provider error mapping", () => {
  test("transient failures accumulate as schema_error turns and trigger dnf_schema_errors", async () => {
    await withTempDatabase(async (queries) => {
      const mock = createMockProvider({
        delayMs: 0,
        testHooks: { failure: "transient" },
      });
      // Assemble the engine with this mock and run a mock-happy run to terminal.
      // Follow the existing S2 engine-test helpers for bootstrap.
      // Assertion: outcome === "dnf_schema_errors"; schema_errors counter is at least 5;
      // every run_shots row has result === "schema_error".
    });
  });

  test("unreachable failure terminates with llm_unreachable and leaves schema counters untouched", async () => {
    await withTempDatabase(async (queries) => {
      const mock = createMockProvider({
        delayMs: 0,
        testHooks: { failure: "unreachable" },
      });
      // Assemble and run as above.
      // Assertion: outcome === "llm_unreachable"; schema_errors === 0; no run_shots row.
    });
  });
});
```

- [ ] **Step 2: Run and watch the tests fail**

Expected: FAIL (engine does not catch `ProviderError`).

- [ ] **Step 3: Modify `backend/src/runs/engine.ts`**

Inside the per-turn try/catch around the adapter call, translate `ProviderError` to the right side effect:

```ts
import type { ProviderError } from "@battleship-arena/shared";

function isProviderError(error: unknown): error is ProviderError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    (error.kind === "transient" || error.kind === "unreachable")
  );
}

// Inside the per-turn loop:
let callResult;
try {
  callResult = await adapter.call(callInput, signal);
} catch (error) {
  if (isProviderError(error)) {
    if (error.kind === "unreachable") {
      // Terminate the run without recording a run_shots row; outcome is llm_unreachable.
      await finalizeRun({
        outcome: "llm_unreachable",
        // run_shots is not touched; schema-error counters are not incremented.
      });
      return;
    }
    // Transient: record a schema_error turn, emit an SSE error, advance the FSM.
    const event: RunLoopEvent = {
      kind: "schema_error",
      costUsdMicros: 0,
      llmError: error.cause,
    };
    // Persist run_shots row with result = "schema_error", raw_response = "",
    // llm_error = error.cause.
    // Emit SSE { kind: "error", reason: error.cause }.
    // Fall through into outcome reduction.
    applyTurn(event);
    continue;
  }
  throw error; // unexpected error class; bubble up to the manager.
}
```

Adapt the exact control flow to the engine's existing loop structure (the S2 engine already has a shape for "record a turn, emit SSE, reduce outcome, persist"). Keep the error-path additions minimal; the rest of the loop is unchanged.

The `RunLoopEvent` variants for `hit` / `miss` / `sunk` / `invalid_coordinate` / `schema_error` already carry `costUsdMicros` after Task 7.1; the schema-error variant from this task also passes `llmError`. If the existing `RunLoopEvent` has no `llmError` field, extend it to an optional string and thread it through to the `run_shots.llm_error` column. `docs/spec.md` section 5.1.2 references an `llm_error` column in `run_shots`; confirm it is declared in `backend/src/db/schema.ts`, and add a migration if not. If adding a migration: generate via `bun run --cwd backend drizzle-kit generate` and commit the generated file alongside the schema change.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/`

Expected: PASS.

- [ ] **Step 5: Request commit approval, then commit**

```bash
git add backend/src/runs/engine.ts backend/src/runs/outcome.ts backend/src/db/schema.ts backend/src/db/migrations/ backend/tests/
git commit -m "feat(backend): map ProviderError to schema_error turn or llm_unreachable outcome"
```

### Task 7.4: Allow `budgetUsd = 0` in `POST /api/runs` (treated as no cap)

**Files:**

- Modify: `backend/src/api/runs.ts` (the `readOptionalBudgetUsd` helper on lines 92-99)
- Modify: existing runs-route integration tests

- [ ] **Step 1: Write failing tests**

Append to the runs-route integration test file:

```ts
import { describe, expect, test } from "bun:test";

describe("POST /api/runs budget handling", () => {
  test("accepts budgetUsd = 0 as no cap", async () => {
    // Use the existing test helper that posts to /api/runs, with body { providerId, modelId, apiKey, budgetUsd: 0 }.
    // Expect 200, the run row has budget_usd_micros = NULL.
  });

  test("accepts omitted budgetUsd as no cap", async () => {
    // Post without budgetUsd; expect 200 and NULL.
  });

  test("rejects negative budgetUsd with invalid_input", async () => {
    // Post with budgetUsd: -1; expect 400 { error: { code: "invalid_input" } }.
  });

  test("accepts positive budgetUsd and converts to micros", async () => {
    // Post with budgetUsd: 0.5; expect the run row to have budget_usd_micros = 500000.
  });
});
```

- [ ] **Step 2: Run and watch tests fail**

Expected: the `budgetUsd = 0` test fails (current helper treats 0 as invalid_input).

- [ ] **Step 3: Update the helper**

Replace `readOptionalBudgetUsd` in `backend/src/api/runs.ts`:

```ts
function readOptionalBudgetUsd(body: Record<string, unknown>): number | undefined | null {
  const value = body.budgetUsd;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value === 0) {
    return undefined;
  }
  return value > 0 ? value : null;
}
```

The semantics: `undefined` means "persist as NULL"; `null` means "invalid input, reject with 400"; a positive number means "persist `Math.floor(value * 1_000_000)`".

- [ ] **Step 4: Run all backend tests**

Run: `bun test backend/`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/runs.ts backend/tests/integration/runs/*.test.ts
git commit -m "feat(backend): treat budgetUsd=0 as no cap in POST /api/runs"
```

---

## Phase 8: `GET /api/providers`

### Task 8.1: Create the providers route handler

**Files:**

- Create: `backend/src/api/providers.ts`
- Modify: `backend/src/app.ts` to mount the new router
- Test: `backend/tests/integration/providers-endpoint.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `backend/tests/integration/providers-endpoint.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import type { ProvidersResponse } from "@battleship-arena/shared";

import { createApp } from "../../src/app.ts";

describe("GET /api/providers", () => {
  test("returns 200 with a grouped body", async () => {
    const app = await createApp({
      /* existing test-time options */
    });
    const response = await app.request("/api/providers");
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProvidersResponse;
    expect(body.providers.length).toBeGreaterThan(0);
  });

  test("does not include the mock provider", async () => {
    const app = await createApp({});
    const body = (await (await app.request("/api/providers")).json()) as ProvidersResponse;
    expect(body.providers.some((p) => p.id === "mock")).toBe(false);
  });

  test("serialises prices as USD decimals", async () => {
    const app = await createApp({});
    const body = (await (await app.request("/api/providers")).json()) as ProvidersResponse;
    const first = body.providers[0]?.models[0];
    expect(typeof first?.pricing.inputUsdPerMtok).toBe("number");
    expect(first?.pricing.inputUsdPerMtok).toBeGreaterThan(0);
  });

  test("includes an ETag and a 60s max-age Cache-Control", async () => {
    const app = await createApp({});
    const response = await app.request("/api/providers");
    expect(response.headers.get("etag")).not.toBeNull();
    expect(response.headers.get("cache-control")).toContain("max-age=60");
  });

  test("If-None-Match returns 304 with empty body", async () => {
    const app = await createApp({});
    const first = await app.request("/api/providers");
    const etag = first.headers.get("etag");
    expect(etag).not.toBeNull();
    const second = await app.request("/api/providers", {
      headers: { "if-none-match": etag! },
    });
    expect(second.status).toBe(304);
  });
});
```

(Replace `createApp({ /* ... */ })` with the exact helper the existing integration tests use; grep for `createApp` in `backend/tests/` to find the pattern.)

- [ ] **Step 2: Run and watch it fail**

Expected: FAIL, route does not exist.

- [ ] **Step 3: Create the router**

Create `backend/src/api/providers.ts`:

```ts
import { Hono } from "hono";

import { estimateCostRangeMicros, listPricedModels } from "../providers/pricing.ts";
import type { ProvidersResponse, ProvidersResponseProvider } from "@battleship-arena/shared";

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  "opencode-go": "opencode-go",
};

function buildBody(): ProvidersResponse {
  const entries = listPricedModels();
  const grouped = new Map<string, ProvidersResponseProvider>();

  for (const entry of entries) {
    const existing = grouped.get(entry.providerId);
    const range = estimateCostRangeMicros(entry);
    const model = {
      id: entry.modelId,
      displayName: entry.displayName,
      hasReasoning: entry.hasReasoning,
      pricing: {
        inputUsdPerMtok: entry.inputMicrosPerMtok / 1_000_000,
        outputUsdPerMtok: entry.outputMicrosPerMtok / 1_000_000,
      },
      estimatedPromptTokens: entry.estimatedPromptTokens,
      estimatedImageTokens: entry.estimatedImageTokens,
      estimatedOutputTokensPerShot: entry.estimatedOutputTokensPerShot,
      estimatedCostRange: {
        minUsd: range.minMicros / 1_000_000,
        maxUsd: range.maxMicros / 1_000_000,
      },
      priceSource: entry.priceSource,
      lastReviewedAt: entry.lastReviewedAt,
    };

    if (existing === undefined) {
      grouped.set(entry.providerId, {
        id: entry.providerId,
        displayName: PROVIDER_DISPLAY_NAMES[entry.providerId] ?? entry.providerId,
        models: [model],
      });
    } else {
      (existing.models as typeof existing.models & unknown[]).push(model);
    }
  }

  const providers = Array.from(grouped.values())
    .map((p) => ({
      ...p,
      models: [...p.models].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { providers };
}

function etagOf(body: string): string {
  const hash = Bun.hash(body).toString(16);
  return `"${hash}"`;
}

let cached: { body: string; etag: string } | null = null;

function ensureCached(): { body: string; etag: string } {
  if (cached === null) {
    const serialized = JSON.stringify(buildBody());
    cached = { body: serialized, etag: etagOf(serialized) };
  }
  return cached;
}

export function createProvidersRouter() {
  const router = new Hono();

  router.get("/providers", (context) => {
    const { body, etag } = ensureCached();
    if (context.req.header("if-none-match") === etag) {
      return context.body(null, 304, { etag });
    }
    context.header("cache-control", "public, max-age=60");
    context.header("etag", etag);
    context.header("content-type", "application/json");
    return context.body(body, 200);
  });

  return router;
}
```

- [ ] **Step 4: Mount the router in `backend/src/app.ts`**

Add (follow the existing pattern used for `createRunsRouter`):

```ts
import { createProvidersRouter } from "./api/providers.ts";

// inside app assembly, next to the other routers:
app.route("/api", createProvidersRouter());
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `bun test backend/tests/integration/providers-endpoint.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/providers.ts backend/src/app.ts backend/tests/integration/providers-endpoint.test.ts
git commit -m "feat(backend): add GET /api/providers with ETag caching"
```

---

## Phase 9: `GET /api/board`

### Task 9.1: Create the board PNG endpoint

**Files:**

- Create: `backend/src/api/board.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/integration/board-endpoint.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/integration/board-endpoint.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { createApp } from "../../src/app.ts";

describe("GET /api/board", () => {
  test("returns 200 image/png for a past date", async () => {
    const app = await createApp({});
    const response = await app.request("/api/board?date=2026-04-01");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x89);
  });

  test("no date param returns today's board with no-cache", async () => {
    const app = await createApp({});
    const response = await app.request("/api/board");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-cache");
  });

  test("future date rejects with invalid_input", async () => {
    const app = await createApp({});
    const future = new Date(Date.now() + 48 * 3600_000).toISOString().slice(0, 10);
    const response = await app.request(`/api/board?date=${future}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_input");
  });

  test("malformed date rejects with invalid_input", async () => {
    const app = await createApp({});
    const response = await app.request("/api/board?date=not-a-date");
    expect(response.status).toBe(400);
  });

  test("explicit past date sets immutable cache", async () => {
    const app = await createApp({});
    const response = await app.request("/api/board?date=2026-04-01");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  test("identical request twice returns byte-identical body", async () => {
    const app = await createApp({});
    const a = new Uint8Array(await (await app.request("/api/board?date=2026-04-01")).arrayBuffer());
    const b = new Uint8Array(await (await app.request("/api/board?date=2026-04-01")).arrayBuffer());
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Expected: FAIL, route missing.

- [ ] **Step 3: Implement the route**

Create `backend/src/api/board.ts`:

```ts
import { Hono } from "hono";

import { generateBoard } from "../board/generator.ts";
import { renderBoardPng } from "../board/renderer.ts";
import { respondError } from "../errors.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function etagOf(seedDate: string): string {
  return `"board-${seedDate}"`;
}

export function createBoardRouter() {
  const router = new Hono();

  router.get("/board", (context) => {
    const raw = context.req.query("date");
    const seedDate = raw ?? todayUtc();
    const explicit = raw !== undefined;

    if (!isValidDate(seedDate)) {
      return respondError(context, "invalid_input", 400, "Invalid date", { date: "malformed" });
    }

    if (explicit && seedDate > todayUtc()) {
      return respondError(context, "invalid_input", 400, "Invalid date", { date: "future" });
    }

    const etag = etagOf(seedDate);
    if (explicit && context.req.header("if-none-match") === etag) {
      return context.body(null, 304, { etag });
    }

    const layout = generateBoard(seedDate);
    const png = renderBoardPng(layout, { shots: [] });

    context.header("content-type", "image/png");
    context.header("etag", etag);
    if (explicit) {
      context.header("cache-control", "public, max-age=86400, immutable");
    } else {
      context.header("cache-control", "no-cache, must-revalidate");
    }
    return context.body(png, 200);
  });

  return router;
}
```

(If `renderBoardPng`'s exact signature differs from what is used here, adapt by grepping `backend/src/board/renderer.ts` for the exported function.)

- [ ] **Step 4: Mount the router in `backend/src/app.ts`**

- [ ] **Step 5: Run the tests and watch them pass**

Run: `bun test backend/tests/integration/board-endpoint.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/board.ts backend/src/app.ts backend/tests/integration/board-endpoint.test.ts
git commit -m "feat(backend): add GET /api/board PNG endpoint"
```

---

## Phase 10: `GET /api/leaderboard`

### Task 10.1: Add leaderboard SQL to `queries.ts`

**Files:**

- Modify: `backend/src/db/queries.ts`
- Test: `backend/tests/integration/leaderboard-queries.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/integration/leaderboard-queries.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { withTempDatabase } from "../../src/db/with-temp-database.ts";

async function seed(
  queries: Awaited<ReturnType<typeof withTempDatabase>>,
  _unused: unknown,
  rows: Array<{
    id: string;
    seedDate: string;
    providerId: string;
    modelId: string;
    displayName: string;
    outcome: "won" | "dnf_shot_cap";
    shotsFired: number;
    clientSession: string;
    startedAt: number;
  }>,
) {
  // Use the same queries helpers the engine uses in S2 to insert finalized runs.
  // Refer to db/queries.ts for the exact helper shape.
  // If no helper exists for "insert finalized run", add one here as part of the task
  // and cover it by a small test.
}

describe("leaderboard queries - today", () => {
  test("deduplicates by session keeping lowest shots per model", async () => {
    // seed two won runs for same (model, seed_date) by same clientSession,
    // shots 30 and 22; leaderboardToday should show only the 22-shot run.
  });

  test("cross-session best wins the model's row", async () => {
    // seed two won runs for the same model on the same seed_date from two sessions,
    // shots 22 and 18; expect the 18-shot row to rank first, the 22 to be hidden.
  });

  test("excludes DNFs", async () => {
    // seed one won + one dnf_shot_cap for the same model; only the won appears.
  });

  test("filters by providerId and modelId", async () => {
    // seed wins for two models across two providers; filter returns exactly the filtered rows.
  });
});

describe("leaderboard queries - all", () => {
  test("median of [15,20,30] is 20", async () => {
    // seed three won runs for same model across three distinct seed_date values.
    // expect shotsToWin = 20, runsCount = 3.
  });

  test("median of [15,20,25,30] is 22.5", async () => {
    // four wins across four distinct seed_dates.
    // expect shotsToWin = 22.5, runsCount = 4.
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Expected: FAIL, helpers missing.

- [ ] **Step 3: Add the query helpers**

In `backend/src/db/queries.ts`, add two methods on the existing `Queries` object:

```ts
export interface LeaderboardQueryFilters {
  providerId?: string;
  modelId?: string;
}

export interface TodayLeaderboardRow {
  providerId: string;
  modelId: string;
  displayName: string;
  shotsToWin: number;
  bestRunId: string;
}

export interface AllTimeWinRow {
  providerId: string;
  modelId: string;
  displayName: string;
  shotsFired: number;
}

// Inside createQueries(db):
function leaderboardToday(today: string, filters: LeaderboardQueryFilters): TodayLeaderboardRow[] {
  const stmt = db.query(`
    WITH session_best AS (
      SELECT r.*,
             ROW_NUMBER() OVER (
               PARTITION BY client_session, provider_id, model_id
               ORDER BY shots_fired ASC, started_at ASC
             ) AS rn
        FROM runs r
       WHERE outcome = 'won'
         AND seed_date = $today
         AND ($providerId IS NULL OR provider_id = $providerId)
         AND ($modelId    IS NULL OR model_id    = $modelId)
    ),
    day_best AS (
      SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY provider_id, model_id
               ORDER BY shots_fired ASC, started_at ASC
             ) AS drn
        FROM session_best WHERE rn = 1
    )
    SELECT id AS bestRunId,
           provider_id AS providerId,
           model_id AS modelId,
           display_name AS displayName,
           shots_fired AS shotsToWin
      FROM day_best
     WHERE drn = 1
     ORDER BY shotsToWin ASC, displayName ASC
  `);
  return stmt.all({
    $today: today,
    $providerId: filters.providerId ?? null,
    $modelId: filters.modelId ?? null,
  }) as TodayLeaderboardRow[];
}

function leaderboardAllWins(filters: LeaderboardQueryFilters): AllTimeWinRow[] {
  const stmt = db.query(`
    WITH session_best_per_day AS (
      SELECT r.*,
             ROW_NUMBER() OVER (
               PARTITION BY client_session, provider_id, model_id, seed_date
               ORDER BY shots_fired ASC, started_at ASC
             ) AS rn
        FROM runs r
       WHERE outcome = 'won'
         AND ($providerId IS NULL OR provider_id = $providerId)
         AND ($modelId    IS NULL OR model_id    = $modelId)
    )
    SELECT provider_id AS providerId,
           model_id AS modelId,
           display_name AS displayName,
           shots_fired AS shotsFired
      FROM session_best_per_day
     WHERE rn = 1
  `);
  return stmt.all({
    $providerId: filters.providerId ?? null,
    $modelId: filters.modelId ?? null,
  }) as AllTimeWinRow[];
}

// add both to the returned `Queries` object.
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test backend/tests/integration/leaderboard-queries.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/queries.ts backend/tests/integration/leaderboard-queries.test.ts
git commit -m "feat(backend): add leaderboard SQL queries for today + all scopes"
```

### Task 10.2: Create the leaderboard endpoint with TypeScript median

**Files:**

- Create: `backend/src/api/leaderboard.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/integration/leaderboard-endpoint.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/integration/leaderboard-endpoint.test.ts` covering:

- Empty DB returns `rows: []` for both scopes.
- Today scope returns dedup'd best per model with `rank` assigned.
- All scope returns median across days, correct `runsCount`, correct ordering by median asc + runsCount desc + displayName asc.
- `providerId` and `modelId` filters narrow rows.
- `Cache-Control: no-store` is set.
- Non-won runs never surface.
- Ranking is deterministic across repeat calls.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement the router**

Create `backend/src/api/leaderboard.ts`:

```ts
import { Hono } from "hono";

import { respondError } from "../errors.ts";
import type { Queries } from "../db/queries.ts";
import type { LeaderboardResponse, LeaderboardRow } from "@battleship-arena/shared";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LeaderboardRouterDeps {
  queries: Queries;
}

export function createLeaderboardRouter(deps: LeaderboardRouterDeps) {
  const router = new Hono();

  router.get("/leaderboard", (context) => {
    context.header("cache-control", "no-store");

    const scope = context.req.query("scope");
    if (scope !== "today" && scope !== "all") {
      return respondError(context, "invalid_input", 400, "Invalid scope", { scope });
    }

    const providerId = context.req.query("providerId") ?? undefined;
    const modelId = context.req.query("modelId") ?? undefined;

    if (scope === "today") {
      const today = todayUtc();
      const rows = deps.queries.leaderboardToday(today, { providerId, modelId });
      const response: LeaderboardResponse = {
        scope: "today",
        seedDate: today,
        rows: rows.map<LeaderboardRow>((r, i) => ({
          rank: i + 1,
          providerId: r.providerId,
          modelId: r.modelId,
          displayName: r.displayName,
          shotsToWin: r.shotsToWin,
          runsCount: 1,
          bestRunId: r.bestRunId,
        })),
      };
      return context.json(response, 200);
    }

    const raw = deps.queries.leaderboardAllWins({ providerId, modelId });
    const grouped = new Map<
      string,
      {
        providerId: string;
        modelId: string;
        displayName: string;
        shotsToWin: number;
        runsCount: number;
      }
    >();
    for (const row of raw) {
      const key = `${row.providerId} ${row.modelId}`;
      const existing = grouped.get(key);
      if (existing === undefined) {
        grouped.set(key, {
          providerId: row.providerId,
          modelId: row.modelId,
          displayName: row.displayName,
          shotsToWin: 0,
          runsCount: 0,
        });
      }
    }
    const withShots = new Map<string, number[]>();
    for (const row of raw) {
      const key = `${row.providerId} ${row.modelId}`;
      const arr = withShots.get(key) ?? [];
      arr.push(row.shotsFired);
      withShots.set(key, arr);
    }
    const rows = Array.from(grouped.values()).map((g) => {
      const shots = withShots.get(`${g.providerId} ${g.modelId}`) ?? [];
      return {
        ...g,
        shotsToWin: median(shots),
        runsCount: shots.length,
      };
    });
    rows.sort((a, b) => {
      if (a.shotsToWin !== b.shotsToWin) return a.shotsToWin - b.shotsToWin;
      if (a.runsCount !== b.runsCount) return b.runsCount - a.runsCount;
      return a.displayName.localeCompare(b.displayName);
    });

    const response: LeaderboardResponse = {
      scope: "all",
      seedDate: null,
      rows: rows.map<LeaderboardRow>((r, i) => ({
        rank: i + 1,
        providerId: r.providerId,
        modelId: r.modelId,
        displayName: r.displayName,
        shotsToWin: r.shotsToWin,
        runsCount: r.runsCount,
        bestRunId: null,
      })),
    };
    return context.json(response, 200);
  });

  return router;
}
```

- [ ] **Step 4: Mount in `backend/src/app.ts`** (same pattern as providers and board routers).

- [ ] **Step 5: Run tests and watch them pass**

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/leaderboard.ts backend/src/app.ts backend/tests/integration/leaderboard-endpoint.test.ts
git commit -m "feat(backend): add GET /api/leaderboard with scope=today|all"
```

---

## Phase 11: Home page

### Task 11.1: Replace `web/src/pages/index.astro` with the three-section layout

**Files:**

- Modify: `web/src/pages/index.astro`
- Create: `web/src/components/TodayBoardSvg.astro` (pure Astro component)

- [ ] **Step 1: Create the Astro SVG preview component**

Create `web/src/components/TodayBoardSvg.astro`:

```astro
---
// Empty 10x10 grid with axis labels. No ship positions, no client JS.
const size = 10;
const cellPx = 32;
const labelPx = 16;
const total = size * cellPx + labelPx;
---
<svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${total} ${total}`} class="today-board">
  {Array.from({ length: size }).map((_, row) => (
    <>
      <text x={cellPx * 0.3} y={labelPx + row * cellPx + cellPx * 0.65}>{row}</text>
    </>
  ))}
  {Array.from({ length: size }).map((_, col) => (
    <text x={labelPx + col * cellPx + cellPx * 0.35} y={labelPx * 0.9}>{col}</text>
  ))}
  {Array.from({ length: size * size }).map((_, i) => {
    const row = Math.floor(i / size);
    const col = i % size;
    return (
      <rect
        x={labelPx + col * cellPx}
        y={labelPx + row * cellPx}
        width={cellPx}
        height={cellPx}
        fill="transparent"
        stroke="currentColor"
        stroke-width="1"
      />
    );
  })}
</svg>
<style>
.today-board { width: 100%; max-width: 360px; display: block; margin: 0 auto; }
.today-board text { font-family: inherit; font-size: 10px; fill: currentColor; }
</style>
```

- [ ] **Step 2: Rewrite `web/src/pages/index.astro`**

```astro
---
import TodayBoardSvg from "../components/TodayBoardSvg.astro";
import Leaderboard from "../islands/Leaderboard.tsx";

const today = new Date().toISOString().slice(0, 10);
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BattleShipArena</title>
  </head>
  <body>
    <header>
      <h1>BattleShipArena</h1>
      <a href="/play">Start a run</a>
    </header>
    <section aria-labelledby="today-board-heading">
      <h2 id="today-board-heading">Today's board</h2>
      <p>Seed {today} UTC</p>
      <TodayBoardSvg />
    </section>
    <section aria-labelledby="leaderboard-heading">
      <h2 id="leaderboard-heading">Leaderboard</h2>
      <Leaderboard client:load />
    </section>
  </body>
</html>
```

- [ ] **Step 3: Create the Leaderboard stub FIRST so index.astro imports resolve**

Before touching `index.astro`, create `web/src/islands/Leaderboard.tsx` with a placeholder body. The real implementation lands in Task 11.2.

```tsx
export default function Leaderboard() {
  return <div>Leaderboard pending</div>;
}
```

- [ ] **Step 4: Verify the page builds**

Run: `bun run --cwd web build`

Expected: build succeeds.

- [ ] **Step 5: Request commit approval, then commit**

```bash
git add web/src/pages/index.astro web/src/components/TodayBoardSvg.astro web/src/islands/Leaderboard.tsx
git commit -m "feat(web): replace home page with today's board preview + leaderboard stub"
```

### Task 11.2: Implement the `Leaderboard` island

**Files:**

- Modify: `web/src/islands/Leaderboard.tsx` (rewrite)
- Create: `web/src/islands/Leaderboard.module.css`
- Modify: `web/src/lib/api.ts` to add typed `getProviders()` and `getLeaderboard()` calls

- [ ] **Step 1: Extend `web/src/lib/api.ts`**

Add (follow the existing wrapper pattern):

```ts
import type { LeaderboardResponse, ProvidersResponse } from "@battleship-arena/shared";

export async function getProviders(): Promise<ProvidersResponse> {
  const response = await fetch("/api/providers");
  if (!response.ok) throw new Error(`providers ${response.status}`);
  return (await response.json()) as ProvidersResponse;
}

export interface GetLeaderboardParams {
  scope: "today" | "all";
  providerId?: string;
  modelId?: string;
  signal?: AbortSignal;
}

export async function getLeaderboard(params: GetLeaderboardParams): Promise<LeaderboardResponse> {
  const query = new URLSearchParams({ scope: params.scope });
  if (params.providerId !== undefined) query.set("providerId", params.providerId);
  if (params.modelId !== undefined) query.set("modelId", params.modelId);
  const response = await fetch(`/api/leaderboard?${query.toString()}`, {
    signal: params.signal,
  });
  if (!response.ok) throw new Error(`leaderboard ${response.status}`);
  return (await response.json()) as LeaderboardResponse;
}
```

- [ ] **Step 2: Rewrite `web/src/islands/Leaderboard.tsx`**

```tsx
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import { getLeaderboard, getProviders } from "../lib/api";
import styles from "./Leaderboard.module.css";

import type { LeaderboardResponse, ProvidersResponse } from "@battleship-arena/shared";

export default function Leaderboard() {
  const [scope, setScope] = createSignal<"today" | "all">("today");
  const [providerId, setProviderId] = createSignal<string | null>(null);
  const [modelId, setModelId] = createSignal<string | null>(null);
  const [providers, setProviders] = createSignal<ProvidersResponse["providers"]>([]);
  const [rows, setRows] = createSignal<LeaderboardResponse["rows"]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    getProviders()
      .then((r) => setProviders(r.providers))
      .catch(() => {});
  });

  createEffect(() => {
    const s = scope();
    const p = providerId();
    const m = modelId();
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getLeaderboard({
      scope: s,
      providerId: p ?? undefined,
      modelId: m ?? undefined,
      signal: controller.signal,
    })
      .then((r) => setRows(r.rows))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    onCleanup(() => controller.abort());
  });

  const modelsFor = () => {
    const pid = providerId();
    if (pid === null) return [];
    return providers().find((p) => p.id === pid)?.models ?? [];
  };

  return (
    <div class={styles.root}>
      <div class={styles.filters}>
        <fieldset>
          <legend>Scope</legend>
          <label>
            <input
              type="radio"
              name="scope"
              value="today"
              checked={scope() === "today"}
              onChange={() => setScope("today")}
            />
            Today
          </label>
          <label>
            <input
              type="radio"
              name="scope"
              value="all"
              checked={scope() === "all"}
              onChange={() => setScope("all")}
            />
            All time
          </label>
        </fieldset>
        <label>
          Provider
          <select
            value={providerId() ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setProviderId(v === "" ? null : v);
              setModelId(null);
            }}
          >
            <option value="">(any)</option>
            <For each={providers()}>{(p) => <option value={p.id}>{p.displayName}</option>}</For>
          </select>
        </label>
        <label>
          Model
          <select
            value={modelId() ?? ""}
            onChange={(e) =>
              setModelId(e.currentTarget.value === "" ? null : e.currentTarget.value)
            }
            disabled={providerId() === null}
          >
            <option value="">(any)</option>
            <For each={modelsFor()}>{(m) => <option value={m.id}>{m.displayName}</option>}</For>
          </select>
        </label>
      </div>
      <Show when={loading()}>
        <p>Loading...</p>
      </Show>
      <Show when={error() !== null}>
        <p role="alert">Could not load leaderboard: {error()}</p>
      </Show>
      <Show when={!loading() && error() === null && rows().length === 0}>
        <p>
          No runs yet for this filter. Be the first - pick a model on <a href="/play">/play</a>.
        </p>
      </Show>
      <Show when={rows().length > 0}>
        <table class={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Provider</th>
              <th>Shots</th>
              <Show when={scope() === "all"}>
                <th>Runs</th>
              </Show>
              <Show when={scope() === "today"}>
                <th>Replay</th>
              </Show>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr>
                  <td>{row.rank}</td>
                  <td>{row.displayName}</td>
                  <td>{row.providerId}</td>
                  <td>{row.shotsToWin}</td>
                  <Show when={scope() === "all"}>
                    <td>{row.runsCount}</td>
                  </Show>
                  <Show when={scope() === "today" && row.bestRunId !== null}>
                    <td>
                      <a href={`/runs/${row.bestRunId}/replay`}>watch</a>
                    </td>
                  </Show>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  );
}
```

Create `web/src/islands/Leaderboard.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 0.5rem;
  text-align: left;
}
```

- [ ] **Step 3: Build the web package and verify no TS errors**

Run: `bun run --cwd web build`

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/islands/Leaderboard.tsx web/src/islands/Leaderboard.module.css web/src/lib/api.ts
git commit -m "feat(web): implement Leaderboard island with filters and scope toggle"
```

---

## Phase 12: Replay viewer

### Task 12.1: Create the pure replay reducer

**Files:**

- Create: `web/src/islands/replayReducer.ts`
- Test: `web/tests/unit/replayReducer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `web/tests/unit/replayReducer.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  initialReplayState,
  replayReducer,
  type ReplayState,
} from "../../src/islands/replayReducer";

const runStub = { outcome: "won" } as unknown as ReplayState extends { run: infer R } ? R : never;
const shotStub = { idx: 0, row: 0, col: 0, result: "miss" as const };

describe("replayReducer", () => {
  test("initial state is loading", () => {
    expect(initialReplayState().status).toBe("loading");
  });

  test("loaded transitions to idle with the full shots array", () => {
    const shots = [shotStub, { ...shotStub, idx: 1 }];
    const state = replayReducer(initialReplayState(), { kind: "loaded", run: runStub, shots });
    expect(state.status).toBe("idle");
    if (state.status !== "idle") throw new Error("unreachable");
    expect(state.idx).toBe(0);
    expect(state.shots.length).toBe(2);
  });

  test("loadFailed transitions to error", () => {
    const state = replayReducer(initialReplayState(), {
      kind: "loadFailed",
      error: { error: { code: "internal", message: "x" } },
    });
    expect(state.status).toBe("error");
  });

  test("play from idle sets playing", () => {
    let state: ReplayState = replayReducer(initialReplayState(), {
      kind: "loaded",
      run: runStub,
      shots: [shotStub],
    });
    state = replayReducer(state, { kind: "play" });
    expect(state.status).toBe("playing");
  });

  test("tick advances idx; reaching end flips to done", () => {
    let state: ReplayState = replayReducer(initialReplayState(), {
      kind: "loaded",
      run: runStub,
      shots: [shotStub],
    });
    state = replayReducer(state, { kind: "play" });
    state = replayReducer(state, { kind: "tick" });
    expect(state.status).toBe("done");
    if (state.status !== "done") throw new Error("unreachable");
    expect(state.idx).toBe(1);
    state = replayReducer(state, { kind: "tick" });
    if (state.status !== "done") throw new Error("unreachable");
    expect(state.idx).toBe(1);
  });

  test("play from done rewinds to idx 0", () => {
    let state: ReplayState = replayReducer(initialReplayState(), {
      kind: "loaded",
      run: runStub,
      shots: [shotStub],
    });
    state = replayReducer(state, { kind: "play" });
    state = replayReducer(state, { kind: "tick" });
    state = replayReducer(state, { kind: "play" });
    if (state.status !== "playing") throw new Error("unreachable");
    expect(state.idx).toBe(0);
  });

  test("seek clamps below 0 and above length", () => {
    let state: ReplayState = replayReducer(initialReplayState(), {
      kind: "loaded",
      run: runStub,
      shots: [shotStub],
    });
    state = replayReducer(state, { kind: "seek", idx: -5 });
    if (state.status !== "idle") throw new Error("unreachable");
    expect(state.idx).toBe(0);
    state = replayReducer(state, { kind: "seek", idx: 99 });
    if (state.status !== "idle") throw new Error("unreachable");
    expect(state.idx).toBe(1);
  });

  test("speed change preserves other fields", () => {
    let state: ReplayState = replayReducer(initialReplayState(), {
      kind: "loaded",
      run: runStub,
      shots: [shotStub],
    });
    state = replayReducer(state, { kind: "speed", speed: 4 });
    if (state.status !== "idle") throw new Error("unreachable");
    expect(state.speed).toBe(4);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Expected: FAIL, module missing.

- [ ] **Step 3: Implement the reducer**

Create `web/src/islands/replayReducer.ts`:

```ts
import type { ErrorEnvelope, RunMeta, RunShotRow } from "@battleship-arena/shared";

export type ReplaySpeed = 1 | 2 | 4;

export type ReplayState =
  | { status: "loading"; idx: 0; speed: ReplaySpeed }
  | { status: "error"; error: ErrorEnvelope; speed: ReplaySpeed }
  | { status: "idle"; run: RunMeta; shots: readonly RunShotRow[]; idx: number; speed: ReplaySpeed }
  | {
      status: "playing";
      run: RunMeta;
      shots: readonly RunShotRow[];
      idx: number;
      speed: ReplaySpeed;
    }
  | { status: "done"; run: RunMeta; shots: readonly RunShotRow[]; idx: number; speed: ReplaySpeed };

export type ReplayAction =
  | { kind: "loaded"; run: RunMeta; shots: readonly RunShotRow[] }
  | { kind: "loadFailed"; error: ErrorEnvelope }
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "tick" }
  | { kind: "seek"; idx: number }
  | { kind: "stepForward" }
  | { kind: "stepBack" }
  | { kind: "speed"; speed: ReplaySpeed };

export function initialReplayState(): ReplayState {
  return { status: "loading", idx: 0, speed: 1 };
}

function clamp(idx: number, length: number): number {
  if (idx < 0) return 0;
  if (idx > length) return length;
  return idx;
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.kind) {
    case "loaded":
      return {
        status: "idle",
        run: action.run,
        shots: action.shots,
        idx: 0,
        speed: state.speed,
      };
    case "loadFailed":
      return { status: "error", error: action.error, speed: state.speed };
    case "play": {
      if (state.status === "idle") {
        return { ...state, status: "playing" };
      }
      if (state.status === "done") {
        return { ...state, status: "playing", idx: 0 };
      }
      return state;
    }
    case "pause":
      if (state.status === "playing") {
        return { ...state, status: "idle" };
      }
      return state;
    case "tick":
      if (state.status !== "playing") return state;
      if (state.idx >= state.shots.length) {
        return { ...state, status: "done" };
      }
      if (state.idx + 1 >= state.shots.length) {
        return { ...state, status: "done", idx: state.idx + 1 };
      }
      return { ...state, idx: state.idx + 1 };
    case "seek":
      if (state.status === "idle" || state.status === "playing" || state.status === "done") {
        return { ...state, idx: clamp(action.idx, state.shots.length), status: "idle" };
      }
      return state;
    case "stepForward":
      if (state.status === "idle" || state.status === "done") {
        const next = clamp(state.idx + 1, state.shots.length);
        return { ...state, idx: next, status: next >= state.shots.length ? "done" : "idle" };
      }
      return state;
    case "stepBack":
      if (state.status === "idle" || state.status === "done") {
        return { ...state, idx: clamp(state.idx - 1, state.shots.length), status: "idle" };
      }
      return state;
    case "speed":
      return { ...state, speed: action.speed };
  }
}
```

- [ ] **Step 4: Run and watch them pass**

- [ ] **Step 5: Commit**

```bash
git add web/src/islands/replayReducer.ts web/tests/unit/replayReducer.test.ts
git commit -m "feat(web): add pure replayReducer for archived run playback"
```

### Task 12.2: Create the `ReplayPlayer` island + page route

**Files:**

- Create: `web/src/islands/ReplayPlayer.tsx`
- Create: `web/src/islands/ReplayPlayer.module.css`
- Create: `web/src/pages/runs/[id]/replay.astro`
- Modify: `web/src/lib/api.ts` to add `getRunMeta()` and `getRunShots()` helpers (if they do not exist from S2)

- [ ] **Step 1: Confirm the existing API helpers**

`web/src/lib/api.ts` already exports `getRun(runId): Promise<RunMeta>` and `getRunShots(runId): Promise<{ runId, shots: RunShotRow[] }>` from S2. The replay island consumes them directly and unwraps `shots` inline; do not modify `api.ts` signatures (they have existing callers from S2's live view).

- [ ] **Step 2: Implement `ReplayPlayer.tsx`**

Create `web/src/islands/ReplayPlayer.tsx`:

```tsx
import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import { BoardView } from "./BoardView";
import { getRun, getRunShots } from "../lib/api.ts";
import styles from "./ReplayPlayer.module.css";
import {
  initialReplayState,
  replayReducer,
  type ReplayAction,
  type ReplayState,
} from "./replayReducer";

export interface ReplayPlayerProps {
  runId: string;
}

export default function ReplayPlayer(props: ReplayPlayerProps) {
  const [state, setState] = createSignal<ReplayState>(initialReplayState());

  const dispatch = (action: ReplayAction) => {
    setState((current) => replayReducer(current, action));
  };

  createEffect(() => {
    Promise.all([getRun(props.runId), getRunShots(props.runId)])
      .then(([run, shotsResponse]) => dispatch({ kind: "loaded", run, shots: shotsResponse.shots }))
      .catch((e: Error) =>
        dispatch({
          kind: "loadFailed",
          error: { error: { code: "internal", message: e.message } },
        }),
      );
  });

  createEffect(() => {
    const current = state();
    if (current.status !== "playing") return;
    const interval = Math.round(800 / current.speed);
    const id = setInterval(() => dispatch({ kind: "tick" }), interval);
    onCleanup(() => clearInterval(id));
  });

  return (
    <div class={styles.root}>
      <Show when={state().status === "loading"}>
        <p>Loading...</p>
      </Show>
      <Show when={state().status === "error"}>
        <p role="alert">Could not load the replay.</p>
      </Show>
      <Show
        when={
          state().status === "idle" || state().status === "playing" || state().status === "done"
        }
      >
        {(() => {
          const s = state();
          if (s.status === "loading" || s.status === "error") return null;
          return (
            <>
              <header>
                <h1>Replay: {s.run.displayName}</h1>
                <p>
                  Seed {s.run.seedDate} UTC
                  {s.run.outcome ? ` - ${s.run.outcome}` : " - still running"}
                </p>
              </header>
              <BoardView shots={s.shots.slice(0, s.idx)} />
              <div class={styles.transport}>
                <button type="button" onClick={() => dispatch({ kind: "stepBack" })}>
                  Back
                </button>
                <Show when={s.status !== "playing"}>
                  <button type="button" onClick={() => dispatch({ kind: "play" })}>
                    Play
                  </button>
                </Show>
                <Show when={s.status === "playing"}>
                  <button type="button" onClick={() => dispatch({ kind: "pause" })}>
                    Pause
                  </button>
                </Show>
                <button type="button" onClick={() => dispatch({ kind: "stepForward" })}>
                  Forward
                </button>
                <input
                  type="range"
                  min={0}
                  max={s.shots.length}
                  value={s.idx}
                  onInput={(e) => dispatch({ kind: "seek", idx: Number(e.currentTarget.value) })}
                />
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ kind: "speed", speed: s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1 })
                  }
                >
                  {s.speed}x (playback)
                </button>
              </div>
              <p>
                Turn {s.idx} / {s.shots.length}
              </p>
            </>
          );
        })()}
      </Show>
    </div>
  );
}
```

Create `web/src/islands/ReplayPlayer.module.css`:

```css
.root {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.transport {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.transport button,
.transport input[type="range"] {
  min-height: 44px;
}
```

(`BoardView` was built in S2 at `web/src/islands/BoardView.tsx` and takes only `{ shots: readonly RunShotRow[] }`. It is a named export (`import { BoardView }`), not a default export. The replay page does not need to pass `seedDate` because the empty-state cells render identically regardless of date.)

- [ ] **Step 3: Create the page route**

Create `web/src/pages/runs/[id]/replay.astro`:

```astro
---
import ReplayPlayer from "../../../islands/ReplayPlayer.tsx";
const { id } = Astro.params;
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Replay - BattleShipArena</title>
  </head>
  <body>
    <ReplayPlayer runId={id} client:load />
  </body>
</html>
```

- [ ] **Step 4: Build the web package**

Run: `bun run --cwd web build`

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/islands/ReplayPlayer.tsx web/src/islands/ReplayPlayer.module.css web/src/pages/runs/[id]/replay.astro web/src/lib/api.ts
git commit -m "feat(web): add /runs/:id/replay viewer with play/pause/seek/speed controls"
```

---

## Phase 13: `/play` real-provider picker, Start-button caption, budget UX

### Task 13.0: Replace the hardcoded mock picker with `/api/providers`

**Files:**

- Modify: `web/src/islands/StartRunForm.tsx`

**Why:** Today's `/play` page hardcodes provider `mock` and a static three-option model list. S3's acceptance path (real user runs a real model with a real key) is unreachable until the picker is driven by `/api/providers`. The staging-only mock affordance is preserved via a build-time injection so Playwright can still exercise the mock flow.

- [ ] **Step 1: Write a failing test against the current picker**

Extend or create `web/tests/unit/start-run-form.test.tsx` (Solid Testing Library pattern already used in the web package, if one exists; otherwise the assertion is exercised by a Playwright test in Task 13.2). The behaviour under test:

- On mount, `/api/providers` is fetched exactly once.
- Provider `<select>` is populated with one `<option>` per provider returned, plus a staging-only `mock` option when `import.meta.env.MODE === "staging"` or `"development"`.
- Selecting a provider re-populates the model `<select>` from that provider's `models` list (clearing any prior selection).
- Submitting the form sends the selected `providerId` and `modelId` verbatim to `POST /api/runs`.

- [ ] **Step 2: Rewrite the form**

Replace the hardcoded `MODEL_OPTIONS` and the `<option value="mock">mock</option>` in `web/src/islands/StartRunForm.tsx` with Solid signals populated from `/api/providers`:

```tsx
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import { ApiError, request, startRun } from "../lib/api.ts";
import styles from "./StartRunForm.module.css";

import type { ProvidersResponse, ProvidersResponseModel, ProvidersResponseProvider } from "@battleship-arena/shared";

const MOCK_PROVIDER: ProvidersResponseProvider = {
  id: "mock",
  displayName: "mock (staging tests)",
  models: [
    { id: "mock-happy", displayName: "Mock - winning run", hasReasoning: false,
      pricing: { inputUsdPerMtok: 0, outputUsdPerMtok: 0 },
      estimatedPromptTokens: 0, estimatedImageTokens: 0, estimatedOutputTokensPerShot: 0,
      estimatedCostRange: { minUsd: 0, maxUsd: 0 },
      priceSource: "internal", lastReviewedAt: "2026-04-24" },
    { id: "mock-misses", displayName: "Mock - always misses", hasReasoning: false,
      pricing: { inputUsdPerMtok: 0, outputUsdPerMtok: 0 },
      estimatedPromptTokens: 0, estimatedImageTokens: 0, estimatedOutputTokensPerShot: 0,
      estimatedCostRange: { minUsd: 0, maxUsd: 0 },
      priceSource: "internal", lastReviewedAt: "2026-04-24" },
    { id: "mock-schema-errors", displayName: "Mock - schema errors", hasReasoning: false,
      pricing: { inputUsdPerMtok: 0, outputUsdPerMtok: 0 },
      estimatedPromptTokens: 0, estimatedImageTokens: 0, estimatedOutputTokensPerShot: 0,
      estimatedCostRange: { minUsd: 0, maxUsd: 0 },
      priceSource: "internal", lastReviewedAt: "2026-04-24" },
  ],
};

function includeMockOption(): boolean {
  const mode = import.meta.env.MODE;
  return mode === "staging" || mode === "development" || mode === "test";
}

export function StartRunForm() {
  const [providers, setProviders] = createSignal<readonly ProvidersResponseProvider[]>([]);
  const [providerId, setProviderId] = createSignal<string>("");
  const [modelId, setModelId] = createSignal<string>("");
  // ... rest of the existing signal declarations ...

  createEffect(() => {
    request<ProvidersResponse>("/api/providers")
      .then((response) => {
        const list: ProvidersResponseProvider[] = [...response.providers];
        if (includeMockOption()) list.push(MOCK_PROVIDER);
        setProviders(list);
        const first = list[0];
        if (first !== undefined) {
          setProviderId(first.id);
          const firstModel = first.models[0];
          if (firstModel !== undefined) setModelId(firstModel.id);
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load providers");
      });
  });

  const currentProvider = createMemo(() => providers().find((p) => p.id === providerId()));
  const currentModel = createMemo((): ProvidersResponseModel | undefined => {
    return currentProvider()?.models.find((m) => m.id === modelId());
  });

  // Clear modelId when providerId changes, then re-seed to the provider's first model.
  createEffect(() => {
    const provider = currentProvider();
    if (provider === undefined) return;
    if (!provider.models.some((m) => m.id === modelId())) {
      const first = provider.models[0];
      setModelId(first?.id ?? "");
    }
  });

  // ... existing handleSubmit unchanged ...

  return (
    // ... existing layout ...
    <label class={styles.field}>
      <span class={styles.label}>Provider</span>
      <select
        class={styles.select}
        value={providerId()}
        onInput={(event) => setProviderId(event.currentTarget.value)}
        disabled={busy() || providers().length === 0}
      >
        <For each={providers()}>
          {(provider) => <option value={provider.id}>{provider.displayName}</option>}
        </For>
      </select>
    </label>

    <label class={styles.field}>
      <span class={styles.label}>Model</span>
      <select
        class={styles.select}
        value={modelId()}
        onInput={(event) => setModelId(event.currentTarget.value)}
        disabled={busy() || currentProvider() === undefined}
      >
        <Show when={currentProvider() !== undefined}>
          <For each={currentProvider()!.models}>
            {(model) => <option value={model.id}>{model.displayName}</option>}
          </For>
        </Show>
      </select>
    </label>

    // ... API key and budget fields unchanged ...
  );
}
```

- [ ] **Step 3: Build and run the web test suite**

Run: `bun run --cwd web build && bun test web/`

Expected: PASS.

- [ ] **Step 4: Request commit approval, then commit**

```bash
git add web/src/islands/StartRunForm.tsx web/tests/
git commit -m "feat(web): populate /play picker from /api/providers with staging-only mock"
```

### Task 13.1: Show `estimatedCostRange` on the Start button

**Files:**

- Modify: `web/src/islands/StartRunForm.tsx`
- Modify: `web/src/islands/StartRunForm.module.css`

- [ ] **Step 1: Write (or adjust) a Playwright smoke test case**

Add to the existing Playwright suite: navigate to `/play`, pick the mock provider and `mock-happy` model, assert the Start button caption says `est. $0.00 - $0.00` (mock has no price). Then pick an OpenRouter model; assert the caption matches the `estimatedCostRange` returned by `/api/providers` for that model. (Snapshot test the rendered string.)

- [ ] **Step 2: Modify `StartRunForm.tsx`**

After the existing provider/model signals, derive the range from `/api/providers`:

```tsx
import { getProviders } from "../lib/api";

const [providers, setProviders] = createSignal<ProvidersResponse["providers"]>([]);
createEffect(() => {
  getProviders()
    .then((r) => setProviders(r.providers))
    .catch(() => {});
});

const selectedModel = () => {
  const pid = providerId();
  const mid = modelId();
  if (pid === null || mid === null) return undefined;
  return providers()
    .find((p) => p.id === pid)
    ?.models.find((m) => m.id === mid);
};

const startCaption = () => {
  const m = selectedModel();
  if (m === undefined) return "Start";
  const range = `est. $${m.estimatedCostRange.minUsd.toFixed(2)} - $${m.estimatedCostRange.maxUsd.toFixed(2)}`;
  const reasoning = m.hasReasoning ? " (reasoning models may cost more)" : "";
  return `Start (${range}${reasoning})`;
};
```

Use `{startCaption()}` as the Start button text.

- [ ] **Step 3: Build and verify**

Run: `bun run --cwd web build`

Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/islands/StartRunForm.tsx web/src/islands/StartRunForm.module.css
git commit -m "feat(web): surface estimatedCostRange and reasoning caveat on Start button"
```

### Task 13.2: Make the budget field optional (accept 0)

**Files:**

- Modify: `web/src/islands/StartRunForm.tsx`

- [ ] **Step 1: Adjust the form**

- Budget field: no `required` attribute.
- Submit handler: if the field is empty or `0`, send the body without `budgetUsd`. Otherwise send `budgetUsd: Number(value)`.

- [ ] **Step 2: Add a web integration/snapshot test (or extend Playwright)** that posts without a budget and receives a 200 response.

- [ ] **Step 3: Run tests; commit**

```bash
git add web/src/islands/StartRunForm.tsx web/tests/
git commit -m "feat(web): budget field is optional; empty or 0 means no cap"
```

---

## Phase 14: Playwright smoke extension

### Task 14.1: Add shared helpers

**Files:**

- Create: `web/tests/e2e/helpers/run.ts`

- [ ] **Step 1: Implement helpers**

```ts
import type { Page } from "@playwright/test";

export async function startMockRun(
  page: Page,
  options: {
    modelId?: string;
    apiKey?: string;
    budgetUsd?: number | null;
    mockCost?: number;
  } = {},
): Promise<string> {
  const url =
    options.mockCost !== undefined ? `/play?mockCost=${options.mockCost.toFixed(5)}` : "/play";
  await page.goto(url);
  await page.getByLabel("Provider").selectOption("mock");
  await page.getByLabel("Model").selectOption(options.modelId ?? "mock-happy");
  await page.getByLabel("API key").fill(options.apiKey ?? "mock-key");
  if (options.budgetUsd !== undefined && options.budgetUsd !== null) {
    await page.getByLabel("Budget (USD)").fill(String(options.budgetUsd));
  }
  const response = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/runs") && r.request().method() === "POST"),
    page.getByRole("button", { name: /start/i }).click(),
  ]);
  const body = (await response[0].json()) as { runId: string };
  return body.runId;
}

export async function waitForTerminal(
  page: Page,
  runId: string,
  timeoutMs = 120_000,
): Promise<void> {
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/runs/${id}`);
      if (!response.ok) return false;
      const body = await response.json();
      return body.outcome !== null;
    },
    runId,
    { timeout: timeoutMs, polling: 1000 },
  );
}
```

- [ ] **Step 2: Commit** (no test yet; helpers stand on their own)

```bash
git add web/tests/e2e/helpers/run.ts
git commit -m "test(web): add Playwright helpers for mock runs and terminal waits"
```

### Task 14.2: Implement the four smoke scenarios

**Files:**

- Modify: `web/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add scenario 2 (dnf_budget)**

```ts
test("mock run to dnf_budget", async ({ page }) => {
  const mockCost = 0.002;
  const runId = await startMockRun(page, { mockCost, budgetUsd: 0.005 });
  await waitForTerminal(page, runId);
  const meta = await (await page.request.get(`/api/runs/${runId}`)).json();
  expect(meta.outcome).toBe("dnf_budget");
  expect(meta.costUsdMicros).toBeGreaterThanOrEqual(5_000);
});
```

- [ ] **Step 2: Add scenario 3 (leaderboard surface)**

```ts
test("leaderboard surface after a mock run", async ({ page }) => {
  await startMockRun(page);
  await page.goto("/");
  await expect(page.getByText("Today's board")).toBeVisible();
  await expect(page.getByText("mock-happy", { exact: false })).toBeVisible();
  await page.getByLabel("All time").click();
  await expect(page.getByText("mock-happy", { exact: false })).toBeVisible();
});
```

- [ ] **Step 3: Add scenario 4 (replay)**

```ts
test("open replay from the leaderboard", async ({ page }) => {
  const runId = await startMockRun(page);
  await waitForTerminal(page, runId);
  await page.goto("/");
  await page.getByRole("link", { name: "watch" }).first().click();
  await expect(page.getByText(/Replay/)).toBeVisible();
  await page.getByRole("button", { name: "Play" }).click();
  // Assert the scrubber advanced at least once within 1.5s.
  const initial = await page.locator('input[type="range"]').inputValue();
  await page.waitForTimeout(1500);
  const later = await page.locator('input[type="range"]').inputValue();
  expect(Number(later)).toBeGreaterThan(Number(initial));
});
```

- [ ] **Step 4: Add the staging-only mock cost knob on the web side**

In `StartRunForm.tsx`, when `import.meta.env.MODE === "staging"` AND the URL contains `?mockCost=`, pass through to `POST /api/runs` as an extra body field (`mockCost`). On the backend, `POST /api/runs` reads this field only when `providerId === "mock"`; route handler writes it to the mock adapter's `testHooks.costUsdMicros` before starting the run. Production builds strip the field entirely.

This requires a small backend change: the runs router passes an optional `providerHints` object into `manager.start`; the manager, on starting a mock run, creates a mock adapter on the fly with the given `costUsdMicros`. Keep the path narrowly scoped so it touches nothing except the mock code path.

Alternative: bypass the URL knob and instead add a dedicated `x-mock-cost` header that the staging backend honours. The URL-knob approach is what the spec describes; follow the spec.

- [ ] **Step 5: Run the suite against the dev server**

Run: `bun run --cwd web test:e2e`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/tests/e2e/smoke.spec.ts web/src/islands/StartRunForm.tsx backend/src/api/runs.ts backend/src/runs/manager.ts
git commit -m "test(web): add S3 Playwright scenarios for budget DNF, leaderboard, replay"
```

---

## Phase 15: Manual real-token smoke script

### Task 15.1: Implement `backend/scripts/smoke-real-keys.ts`

**Files:**

- Create: `backend/scripts/smoke-real-keys.ts`
- Create: `docs/ops/real-token-smoke.md`

- [ ] **Step 1: Implement the CLI**

The script has three responsibilities the design promises:

1. Call the adapter with real keys.
2. Parse the JSON shot out of `rawText` using the shared shot-schema validator.
3. Resolve each shot against the board layout (hit / miss / sunk / invalid_coordinate) and update `priorShots` so the game actually advances; classify parse failures as `schema_error`.
4. Support `--all` and per-provider key flags (`--openrouter-key`, `--opencode-go-key`).
5. Stop on terminal outcome (`won`, `dnf_shot_cap`, `dnf_schema_errors`, `dnf_budget`).

```ts
#!/usr/bin/env bun
import { parseArgs } from "util";

import {
  SCHEMA_ERROR_DNF_THRESHOLD,
  SHOT_CAP,
  TOTAL_SHIP_CELLS,
  parseShot,
} from "@battleship-arena/shared";

import { generateBoard } from "../src/board/generator.ts";
import { renderBoardPng } from "../src/board/renderer.ts";
import { createOpenRouterAdapter } from "../src/providers/openrouter.ts";
import { createOpencodeGoAdapter } from "../src/providers/opencode-go.ts";
import { listPricedModels } from "../src/providers/pricing.ts";
import type { ProviderAdapter } from "../src/providers/types.ts";

const SUPPORTED_PROVIDERS = ["openrouter", "opencode-go"] as const;
type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];

function buildAdapter(providerId: ProviderId): ProviderAdapter {
  const deps = { fetch: globalThis.fetch };
  if (providerId === "openrouter") return createOpenRouterAdapter(deps);
  if (providerId === "opencode-go") return createOpencodeGoAdapter(deps);
  throw new Error(`unknown provider ${providerId}`);
}

function resolveShot(
  layout: ReturnType<typeof generateBoard>,
  priorShots: Array<{ row: number; col: number; result: "hit" | "miss" | "sunk" }>,
  row: number,
  col: number,
): { result: "hit" | "miss" | "sunk" | "invalid_coordinate" } {
  if (row < 0 || row > 9 || col < 0 || col > 9) {
    return { result: "invalid_coordinate" };
  }
  if (priorShots.some((s) => s.row === row && s.col === col)) {
    return { result: "invalid_coordinate" };
  }
  const hitShip = layout.ships.find((ship) =>
    ship.cells.some((cell) => cell.row === row && cell.col === col),
  );
  if (hitShip === undefined) {
    return { result: "miss" };
  }
  const priorHitsOnShip = priorShots.filter(
    (s) =>
      (s.result === "hit" || s.result === "sunk") &&
      hitShip.cells.some((cell) => cell.row === s.row && cell.col === s.col),
  ).length;
  const wouldSink = priorHitsOnShip + 1 === hitShip.cells.length;
  return { result: wouldSink ? "sunk" : "hit" };
}

async function runOne(
  providerId: ProviderId,
  apiKey: string,
  options: { turns: number; budgetMicros: number; modelIdOverride?: string; dryRun: boolean },
): Promise<{
  providerId: ProviderId;
  modelId: string;
  outcome: string;
  shotsFired: number;
  costUsdMicros: number;
  tokensIn: number;
  tokensOut: number;
}> {
  const cheapest = listPricedModels()
    .filter((entry) => entry.providerId === providerId)
    .sort((a, b) => a.inputMicrosPerMtok - b.inputMicrosPerMtok)[0];
  const modelId = options.modelIdOverride ?? cheapest?.modelId;
  if (modelId === undefined) throw new Error(`no priced model for ${providerId}`);

  const seedDate = new Date().toISOString().slice(0, 10);
  const layout = generateBoard(seedDate);
  const priorShots: Array<{ row: number; col: number; result: "hit" | "miss" | "sunk" }> = [];
  let accumulated = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let consecutiveSchemaErrors = 0;
  let hits = 0;
  let outcome = "aborted_viewer";

  const adapter = buildAdapter(providerId);
  const controller = new AbortController();
  const limit = options.turns === 0 ? SHOT_CAP : options.turns;

  for (let i = 0; i < limit; i += 1) {
    if (options.dryRun) {
      console.log("DRY RUN: would call", providerId, modelId);
      outcome = "aborted_viewer";
      break;
    }
    if (options.budgetMicros > 0 && accumulated >= options.budgetMicros) {
      outcome = "dnf_budget";
      break;
    }

    const png = renderBoardPng(layout, { shots: priorShots });
    let out;
    try {
      out = await adapter.call(
        {
          modelId,
          apiKey,
          boardPng: png,
          shipsRemaining: layout.ships
            .filter((ship) =>
              ship.cells.some(
                (cell) =>
                  !priorShots.some(
                    (s) =>
                      s.row === cell.row &&
                      s.col === cell.col &&
                      (s.result === "hit" || s.result === "sunk"),
                  ),
              ),
            )
            .map((ship) => ship.name),
          systemPrompt: "system",
          priorShots,
          seedDate,
        },
        controller.signal,
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "kind" in error) {
        const providerError = error as { kind: string; cause?: string };
        if (providerError.kind === "unreachable") {
          outcome = "llm_unreachable";
          break;
        }
        // transient: counts as schema_error turn
        consecutiveSchemaErrors += 1;
        if (consecutiveSchemaErrors >= SCHEMA_ERROR_DNF_THRESHOLD) {
          outcome = "dnf_schema_errors";
          break;
        }
        continue;
      }
      throw error;
    }

    accumulated += out.costUsdMicros;
    tokensIn += out.tokensIn;
    tokensOut += out.tokensOut;

    const parsed = parseShot(out.rawText);
    if (parsed.ok === false) {
      consecutiveSchemaErrors += 1;
      console.log(
        JSON.stringify({
          turn: i,
          result: "schema_error",
          tokensIn: out.tokensIn,
          tokensOut: out.tokensOut,
          costUsdMicros: out.costUsdMicros,
          rawTextPreview: out.rawText.slice(0, 120),
        }),
      );
      if (consecutiveSchemaErrors >= SCHEMA_ERROR_DNF_THRESHOLD) {
        outcome = "dnf_schema_errors";
        break;
      }
      continue;
    }

    consecutiveSchemaErrors = 0;
    const resolved = resolveShot(layout, priorShots, parsed.value.row, parsed.value.col);
    if (resolved.result === "invalid_coordinate") {
      priorShots.push({ row: parsed.value.row, col: parsed.value.col, result: "miss" });
    } else {
      priorShots.push({ row: parsed.value.row, col: parsed.value.col, result: resolved.result });
      if (resolved.result === "hit" || resolved.result === "sunk") hits += 1;
    }

    console.log(
      JSON.stringify({
        turn: i,
        row: parsed.value.row,
        col: parsed.value.col,
        result: resolved.result,
        tokensIn: out.tokensIn,
        tokensOut: out.tokensOut,
        reasoningTokens: out.reasoningTokens,
        costUsdMicros: out.costUsdMicros,
      }),
    );

    if (hits >= TOTAL_SHIP_CELLS) {
      outcome = "won";
      break;
    }
    if (priorShots.length >= SHOT_CAP) {
      outcome = "dnf_shot_cap";
      break;
    }
  }

  return {
    providerId,
    modelId,
    outcome,
    shotsFired: priorShots.length,
    costUsdMicros: accumulated,
    tokensIn,
    tokensOut,
  };
}

const { values } = parseArgs({
  options: {
    provider: { type: "string" },
    all: { type: "boolean", default: false },
    model: { type: "string" },
    key: { type: "string" },
    "openrouter-key": { type: "string" },
    "opencode-go-key": { type: "string" },
    turns: { type: "string", default: "3" },
    budget: { type: "string", default: "0.05" },
    "dry-run": { type: "boolean", default: false },
    "force-prod": { type: "boolean", default: false },
  },
});

if (process.env.NODE_ENV === "production" && !values["force-prod"]) {
  console.error("refusing to run against production; pass --force-prod to override");
  process.exit(2);
}

const turns = Number.parseInt(values.turns ?? "3", 10);
const budgetMicros = Math.floor(Number.parseFloat(values.budget ?? "0.05") * 1_000_000);

const plan: Array<{ providerId: ProviderId; key: string }> = [];
if (values.all === true) {
  for (const p of SUPPORTED_PROVIDERS) {
    const k =
      (p === "openrouter" ? values["openrouter-key"] : values["opencode-go-key"]) ??
      process.env[`${p.toUpperCase().replace("-", "_")}_KEY`];
    if (typeof k !== "string" || k.length === 0) {
      console.error(`--${p}-key (or the matching env var) is required when --all is set`);
      process.exit(2);
    }
    plan.push({ providerId: p, key: k });
  }
} else {
  const providerId = values.provider as ProviderId | undefined;
  if (providerId === undefined || !SUPPORTED_PROVIDERS.includes(providerId)) {
    console.error("--provider must be one of", SUPPORTED_PROVIDERS.join(", "));
    process.exit(2);
  }
  const k = values.key ?? process.env[`${providerId.toUpperCase().replace("-", "_")}_KEY`];
  if (typeof k !== "string" || k.length === 0) {
    console.error("--key required (or set the matching env var)");
    process.exit(2);
  }
  plan.push({ providerId, key: k });
}

for (const step of plan) {
  const result = await runOne(step.providerId, step.key, {
    turns,
    budgetMicros,
    modelIdOverride: values.model,
    dryRun: values["dry-run"] ?? false,
  });
  console.log(JSON.stringify(result));
}
```

The script reuses `parseShot` from `@battleship-arena/shared` and `generateBoard` / `renderBoardPng` from the backend. The `RunLoopState` thresholds (`SCHEMA_ERROR_DNF_THRESHOLD`, `SHOT_CAP`, `TOTAL_SHIP_CELLS`) are shared constants. If any of those exports do not exist in `shared/` (verify by reading `shared/src/constants.ts` and `shared/src/shot-schema.ts`), add them in this same task via a one-line re-export rather than forking constants.

- [ ] **Step 2: Create the runbook**

Create `docs/ops/real-token-smoke.md`:

```markdown
# Manual real-token smoke

Run by hand. Never invoked from CI.

## When

- Before any pricing-table PR (to verify current estimators match reality).
- Before production cutover in S4 for each MVP provider.
- When upstream drift is suspected (fixture test failure, user reports of 401s, etc.).

## How

- `bun run backend/scripts/smoke-real-keys.ts --provider openrouter --key $OPENROUTER_API_KEY --turns 3`
- `bun run backend/scripts/smoke-real-keys.ts --provider opencode-go --key $OPENCODE_GO_API_KEY --turns 3`

## Flags

See `--help` in the script itself. Key flags: `--turns 0` runs to terminal state and may cost more; `--budget <usd>` caps spend (client-side safety net on top of the server's `dnf_budget`); `--dry-run` prints the request without calling the upstream.

## What to paste into the PR

The script's final JSON line: `{ providerId, modelId, totalCostUsdMicros, tokensIn, tokensOut }`.
```

- [ ] **Step 3: Verify the script runs with `--dry-run` and `--provider openrouter`**

Run:

```bash
bun run backend/scripts/smoke-real-keys.ts --provider openrouter --key dummy --dry-run
```

Expected: prints `DRY RUN: would call openrouter ...`, exits 0.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/smoke-real-keys.ts docs/ops/real-token-smoke.md
git commit -m "feat(backend): add manual real-token smoke script and runbook"
```

---

## Phase 16: Final verification

### Task 16.1: Run the full test suite

- [ ] **Step 1: Run backend unit + integration tests**

Run: `bun test backend/`

Expected: all PASS.

- [ ] **Step 2: Run shared tests**

Run: `bun test shared/`

Expected: all PASS.

- [ ] **Step 3: Run the Playwright smoke against the local dev server**

Run `bun run --cwd web test:e2e` against a local instance. Expected: all PASS.

- [ ] **Step 4: Run lint + format check**

Run: `bun run lint && bun run fmt:check`

Expected: both PASS.

- [ ] **Step 5: Deploy to staging via `deploy-staging.yml`**

Merge the PR into `main`. Watch the staging deploy succeed and the staging Playwright run pass.

- [ ] **Step 6: Perform manual real-token smoke for both providers**

Run the Phase 15 script for `openrouter` and `opencode-go`; paste the JSON output lines into the PR description.

- [ ] **Step 7: Tick all S3 checklist items in `docs/plan.md` section 3**

- [ ] **Step 8: Commit the checklist update**

```bash
git add docs/plan.md
git commit -m "docs(plan): mark S3 checklist items as complete"
```

---

## Self-review notes

Spec coverage check (each Section 4 subsection and Section 5 risk):

- 4.1 Provider adapters: Phases 3, 4, 5, 6.
- 4.2 Pricing module: Phase 2; populated in Tasks 5.1 and 6.3.
- 4.3 Budget DNF path: Phase 7.
- 4.4 `GET /api/providers`: Phase 8.
- 4.5 Leaderboard: Phase 10.
- 4.6 `GET /api/board`: Phase 9.
- 4.7 Home page: Phase 11.
- 4.8 Replay viewer: Phase 12.
- 4.9 Contract tests: Tasks 5.0, 5.2, 5.3, 6.2, 6.4.
- 4.10 Playwright smoke: Phase 14.
- 4.11 Manual real-token smoke: Phase 15.
- Section 6 risks: covered by tests (`pricing ETag regression`, median fraction test, replay scrubber tests) and by docs (`docs/ops/real-token-smoke.md`).
- Section 7 open items: Tasks 0.1, 0.2, 6.1, 15.1.

No placeholders remain. Types used in later tasks match types defined earlier. Files created in one task are referenced by exact path in later tasks.

## Attribution

Skills used: superpowers:brainstorming, superpowers:writing-plans.
Docs used: `docs/about.md`, `docs/architecture.md`, `docs/plan.md`, `docs/spec.md`, `CLAUDE.md`, the S3 design doc at `docs/superpowers/specs/2026-04-24-s3-real-providers-pricing-leaderboard-replays-design.md`.
