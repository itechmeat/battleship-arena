# pricing Specification

## ADDED Requirements

### Requirement: PRICING_TABLE keyed by (providerId, modelId) with integer-micros rates

`backend/src/providers/pricing.ts` SHALL export a `PRICING_TABLE` whose entries are keyed by the exact tuple `(providerId, modelId)`. Every entry MUST carry `providerId`, `modelId`, `displayName`, `hasReasoning`, `inputMicrosPerMtok` and `outputMicrosPerMtok` as integers (USD micros per 1M tokens), the three integer estimator fields (`estimatedPromptTokens`, `estimatedImageTokens`, `estimatedOutputTokensPerShot`), `priceSource` as a URL string, and `lastReviewedAt` as an ISO date string. `getPricingEntry(providerId, modelId)` MUST return the row or `undefined` with no partial matching across providers.

#### Scenario: Lookup hits exact tuple

- **WHEN** `getPricingEntry("openrouter", "some-model-id")` is called and the table contains exactly that tuple
- **THEN** the returned entry has `providerId === "openrouter"` and `modelId === "some-model-id"`

#### Scenario: Same modelId across providers does not collide

- **WHEN** the table contains `(openrouter, shared-id)` and `(opencode-go, shared-id)` and `getPricingEntry("opencode-go", "shared-id")` is called
- **THEN** the returned entry's `providerId` equals `"opencode-go"`, not `"openrouter"`

### Requirement: computeCostMicros applies floor rounding separately to input and output

`computeCostMicros(entry, tokensIn, tokensOut)` SHALL return `floor(tokensIn * entry.inputMicrosPerMtok / 1_000_000) + floor(tokensOut * entry.outputMicrosPerMtok / 1_000_000)` as an integer. Flooring MUST be applied to the input and output halves independently before addition. The function MUST NOT add a separate term for reasoning tokens; reasoning output is already included in the provider's reported `tokensOut`.

#### Scenario: Known-rate mixed turn produces known micros

- **WHEN** `computeCostMicros` is called with `inputMicrosPerMtok = 3_000_000`, `outputMicrosPerMtok = 15_000_000`, `tokensIn = 1000`, `tokensOut = 200`
- **THEN** the return value equals `floor(1000 * 3_000_000 / 1_000_000) + floor(200 * 15_000_000 / 1_000_000)` = `3_000 + 3_000` = `6_000`

#### Scenario: Sub-micro single-token call floors to zero

- **WHEN** `computeCostMicros` is called with `inputMicrosPerMtok = 100_000`, `outputMicrosPerMtok = 100_000`, `tokensIn = 1`, `tokensOut = 1`
- **THEN** the return value equals `0`

#### Scenario: Additive consistency over many turns

- **WHEN** `computeCostMicros` is invoked once per turn for N turns and the results are summed
- **THEN** the sum equals the integer value that ends up persisted in `runs.cost_usd_micros`

### Requirement: estimateCostRangeMicros returns 17 _ perTurn and 100 _ perTurn

`estimateCostRangeMicros(entry)` SHALL return `{ minMicros: 17 * perTurnMicros(entry), maxMicros: 100 * perTurnMicros(entry) }` where `perTurnMicros(entry)` equals `floor((estimatedPromptTokens + estimatedImageTokens) * inputMicrosPerMtok / 1_000_000) + floor(estimatedOutputTokensPerShot * outputMicrosPerMtok / 1_000_000)`. Reasoning tokens MUST NOT be included in `perTurnMicros`.

#### Scenario: Range is exactly 17x and 100x per-turn

- **WHEN** `estimateCostRangeMicros` is called on an entry whose `perTurnMicros` evaluates to `7_000`
- **THEN** the returned `minMicros` equals `119_000` and `maxMicros` equals `700_000`

#### Scenario: Reasoning tokens do not inflate the estimate

- **WHEN** two entries have identical estimator fields but differ only in `hasReasoning`
- **THEN** `estimateCostRangeMicros` returns the same value for both entries

### Requirement: Every pricing entry carries priceSource URL and lastReviewedAt ISO date

Every row in `PRICING_TABLE` SHALL include a `priceSource` field containing a URL string pointing at the provider's pricing page consulted on the capture day and a `lastReviewedAt` field containing an ISO `YYYY-MM-DD` date. A pricing PR that edits any numeric field MUST bump `lastReviewedAt` to the review's UTC date in the same commit.

#### Scenario: Every entry exposes both fields

- **WHEN** `listPricedModels()` is iterated
- **THEN** every entry has a non-empty `priceSource` string and a `lastReviewedAt` string matching `YYYY-MM-DD`

#### Scenario: Numeric edit bumps lastReviewedAt

- **WHEN** a PR changes any of `inputMicrosPerMtok`, `outputMicrosPerMtok`, or the three estimator fields for an entry
- **THEN** the same commit updates that entry's `lastReviewedAt` to an ISO date no earlier than the previous value

### Requirement: Reasoning tokens reported but not priced twice

`PricingEntry.hasReasoning` SHALL indicate whether a model emits reasoning tokens. Cost math MUST treat those tokens as already included in the provider's reported `tokensOut` and MUST NOT add a separate reasoning-tokens term. `GET /api/providers` exposes `hasReasoning` so the UI can surface a caveat, but the estimator never charges reasoning separately.

#### Scenario: Reasoning model with reported reasoning tokens costs same as non-reasoning with same tokensOut

- **WHEN** `computeCostMicros` is called on a reasoning-enabled entry with `tokensIn = 500`, `tokensOut = 1000` and on a non-reasoning entry with identical rates and the same `tokensIn` and `tokensOut`
- **THEN** the two return values are equal
