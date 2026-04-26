# providers-catalog Specification

## ADDED Requirements

### Requirement: GET /api/providers returns grouped providers with pricing and estimators

`GET /api/providers` SHALL return a JSON body of shape `ProvidersResponse`: an array of providers grouped by `providerId`, each with `displayName` and a sorted `models` array. Every model entry MUST include `id`, `displayName`, `hasReasoning`, `pricing.inputUsdPerMtok`, `pricing.outputUsdPerMtok`, `estimatedPromptTokens`, `estimatedImageTokens`, `estimatedOutputTokensPerShot`, `estimatedCostRange.minUsd`, `estimatedCostRange.maxUsd`, `priceSource`, and `lastReviewedAt`.

#### Scenario: Happy fetch returns the typed shape

- **WHEN** a client issues `GET /api/providers`
- **THEN** the response status is `200`, `content-type` is `application/json`, and the body satisfies the `ProvidersResponse` type exported from `shared/`

#### Scenario: estimatedCostRange equals 17x and 100x per-turn in USD

- **WHEN** an entry's `perTurnMicros` evaluates to `7_000`
- **THEN** the response surfaces `estimatedCostRange.minUsd === 0.119` and `estimatedCostRange.maxUsd === 0.7` for that model

### Requirement: Prices serialised as USD decimals per 1M tokens, not micros

`GET /api/providers` SHALL convert the internal integer-micros rates to USD decimal values at serialisation. `pricing.inputUsdPerMtok` MUST equal `inputMicrosPerMtok / 1_000_000`; `pricing.outputUsdPerMtok` MUST equal `outputMicrosPerMtok / 1_000_000`. `estimatedCostRange.minUsd` and `estimatedCostRange.maxUsd` MUST equal the micros values divided by `1_000_000`.

#### Scenario: Rate conversion precision

- **WHEN** an entry's `inputMicrosPerMtok` equals `3_000_000`
- **THEN** the response surfaces `pricing.inputUsdPerMtok === 3`

### Requirement: Mock is excluded from the response body

`GET /api/providers` SHALL NOT include the mock adapter in its response, regardless of whether the backend's provider registry contains a mock entry. The `/play` picker receives real providers from this endpoint and injects the mock option separately for staging builds only.

#### Scenario: Mock absent even when backend has a mock adapter wired

- **WHEN** the backend registry contains a mock adapter and `GET /api/providers` is called
- **THEN** the response body's `providers` array contains no entry whose `id` equals `"mock"`

### Requirement: Response is cacheable with ETag and Cache-Control: public, max-age=60

`GET /api/providers` SHALL attach `Cache-Control: public, max-age=60` and an `ETag` header to every `200` response. The `ETag` MUST be a stable hash of the serialised body; two successive calls without a pricing-table edit MUST return the same `ETag`.

#### Scenario: Cache-Control header present

- **WHEN** a client issues `GET /api/providers`
- **THEN** the response carries `Cache-Control: public, max-age=60`

#### Scenario: ETag stable across repeat calls

- **WHEN** a client issues `GET /api/providers` twice in succession without restarting the process
- **THEN** both responses carry the same `ETag` header value

### Requirement: If-None-Match with matching ETag returns 304

`GET /api/providers` SHALL return `304 Not Modified` with an empty body when the request carries `If-None-Match` whose value equals the current ETag. The response MUST retain the `ETag` and `Cache-Control` headers.

#### Scenario: 304 on matching If-None-Match

- **WHEN** a client sends `GET /api/providers` with `If-None-Match` equal to the previously observed ETag
- **THEN** the response status is `304`, the body is empty, and the `ETag` header matches the request's `If-None-Match`

#### Scenario: 200 on non-matching If-None-Match

- **WHEN** a client sends `GET /api/providers` with `If-None-Match: "stale"`
- **THEN** the response status is `200` and the body contains the full `ProvidersResponse`
