# real-providers Specification

## ADDED Requirements

### Requirement: ProviderAdapter interface honoured by every real adapter

Every real provider adapter SHALL conform to the `ProviderAdapter` shape exported from `backend/src/providers/types.ts`. Each adapter MUST accept a `ProviderCallInput` (including `seedDate`, `priorShots`, board image, ships-remaining preamble, system prompt, model id, and API key) and MUST return a `ProviderCallOutput` carrying `rawText`, `tokensIn`, `tokensOut`, `reasoningTokens`, `costUsdMicros`, and `durationMs`. Adapters MUST NOT extend the interface with free-form fields; new capabilities belong in the shared types module.

#### Scenario: Happy-path call produces a typed ProviderCallOutput

- **WHEN** the OpenRouter adapter is called with a valid input and the canned fetch responds 200 with a parseable body
- **THEN** the returned value carries `rawText`, integer `tokensIn` and `tokensOut`, a `reasoningTokens` field that is either an integer or `null`, a non-negative integer `costUsdMicros`, and a positive `durationMs`

#### Scenario: Adapter factory depends on injected fetch and pricing

- **WHEN** a real adapter is constructed via `createXxxAdapter({ fetch, pricing })`
- **THEN** the adapter does not read `globalThis.fetch` directly and does not import the concrete pricing module

### Requirement: Shared retry-aware HTTP client handles transient and non-retriable failures

The shared HTTP client module SHALL apply the `500 ms / 1500 ms / 4500 ms` backoff schedule from `docs/spec.md` section 6.5 across at most three tries. It MUST honour a `Retry-After` header on `429` responses up to a hard ceiling of 30 seconds per wait. It MUST retry `5xx` and `429` responses within the retry budget. It MUST throw a `NonRetriable4xx` synchronously on any other `4xx` status without retrying. It MUST throw a `TransientFailure` when the retry budget is exhausted by repeated `5xx` or `429` responses.

#### Scenario: 429 with Retry-After is honoured and then succeeds

- **WHEN** the client encounters one `429` with `Retry-After: 1` followed by a `200`
- **THEN** the client waits at most one second, issues a second request, and returns the `200` body

#### Scenario: Retry-After above the ceiling is capped

- **WHEN** the client receives `429` with `Retry-After: 9999`
- **THEN** the client waits no longer than 30 seconds before the next retry, and if the retry budget is exhausted it throws `TransientFailure`

#### Scenario: Three consecutive 5xx raise TransientFailure

- **WHEN** the client receives `503` on the first, second, and third attempts
- **THEN** the client throws `TransientFailure` carrying the final status and response metadata

#### Scenario: 401 is non-retriable

- **WHEN** the client receives `401` on the first attempt
- **THEN** the client throws `NonRetriable4xx` synchronously without issuing further requests

### Requirement: OpenRouter adapter targets chat completions with OpenAI-compatible body shape

The OpenRouter adapter SHALL issue a `POST` to the OpenRouter chat-completions endpoint with an OpenAI-compatible JSON body (`model`, `messages`, and image content block). It MUST place the API key in the `Authorization: Bearer <key>` header. It MUST strip any reasoning or thinking blocks from the assistant message before populating `rawText`. It MUST parse `usage.prompt_tokens` and `usage.completion_tokens` into `tokensIn` and `tokensOut`, and `usage.completion_tokens_details.reasoning_tokens` (or the provider's equivalent) into `reasoningTokens` when present.

#### Scenario: Request shape and auth header

- **WHEN** the adapter is called against a canned `fetch` and a valid input
- **THEN** the recorded request URL contains `openrouter.ai/api/v1/chat/completions`, the method is `POST`, the JSON body carries `model` and `messages`, and the `authorization` header equals `Bearer <test-key>` verbatim

#### Scenario: Reasoning stripped from rawText, tokens preserved

- **WHEN** the response body contains both a `thinking` block and an assistant message
- **THEN** `rawText` contains only the assistant message, `reasoningTokens` is the integer reported by the provider, and `tokensOut` is the provider's `completion_tokens` value unchanged

### Requirement: opencode-go adapter targets its resolved upstream endpoint

The opencode-go adapter SHALL issue its request against the upstream endpoint captured at fixture-capture time, using the auth header the upstream documents at that time. It MUST parse the upstream response into the same `ProviderCallOutput` shape, strip reasoning content from `rawText`, and report `tokensIn`, `tokensOut`, and `reasoningTokens` from the upstream `usage` object.

#### Scenario: Request shape matches captured fixture

- **WHEN** the adapter is called against the opencode-go happy-path fixture
- **THEN** the recorded request URL matches the fixture's `assertUrlContains`, the method matches the fixture's `assertMethod`, and the request body satisfies the fixture's deep-partial body assertion

#### Scenario: Token counts parsed verbatim

- **WHEN** the upstream returns a valid `usage` object
- **THEN** `tokensIn`, `tokensOut`, and `reasoningTokens` in the `ProviderCallOutput` equal the values in that `usage` object exactly

### Requirement: Adapters surface a ProviderError discriminated union on failure

Each real adapter SHALL throw `ProviderError` (as defined in `shared-contract`) with `kind: "transient"` when the HTTP client raises `TransientFailure` and `kind: "unreachable"` when the HTTP client raises `NonRetriable4xx` or the upstream is network-unreachable. The thrown value's `cause` MUST be a non-empty string (matching the `cause: string` field in the shared `ProviderError` type) that describes the originating failure well enough for an operator to diagnose it (for example: `"503 upstream"`, `"timeout after 4500ms"`, `"401 unauthorized"`). For `kind: "unreachable"` the thrown value MUST also carry `status: number` equal to the upstream HTTP status. The adapter MUST NOT embed a live `Response` object, a `Headers` instance, the original thrown `Error`, or any non-string structure into `cause`. The engine branches on `kind` per `docs/spec.md` section 6.5: `transient` becomes a `schema_error` turn; `unreachable` becomes the `llm_unreachable` terminal outcome.

#### Scenario: TransientFailure becomes ProviderError transient with a descriptive string cause

- **WHEN** the HTTP client raises `TransientFailure` after three `5xx` retries
- **THEN** the adapter throws `ProviderError` with `kind === "transient"` and `cause` is a non-empty string that mentions the last status code (for example `"503 upstream"`)

#### Scenario: 401 becomes ProviderError unreachable carrying status

- **WHEN** the HTTP client raises `NonRetriable4xx` on a `401`
- **THEN** the adapter throws `ProviderError` with `kind === "unreachable"`, `status === 401`, and `cause` is a non-empty string referencing the `401`

#### Scenario: cause never carries a live Response or Error instance

- **WHEN** an adapter throws any `ProviderError` variant
- **THEN** `typeof error.cause === "string"` and `error.cause` is not an object reference

### Requirement: API keys never appear in returned output, logs, or captured state

No real adapter SHALL return the API key in any field of `ProviderCallOutput`. No real adapter SHALL emit the API key through `console.log`, `console.warn`, `console.error`, or `console.info`. The API key MUST appear only in the outgoing request's auth header and MUST NOT be serialised into captured fixtures or retained on the adapter after the call returns.

#### Scenario: Sentinel key absent from all output fields

- **WHEN** the adapter is called with a distinctive sentinel API key and returns a `ProviderCallOutput`
- **THEN** `JSON.stringify(output)` does not contain the sentinel substring

#### Scenario: Sentinel key absent from every console level

- **WHEN** spies are installed on every `console` level and the adapter is called with the sentinel key
- **THEN** no spy receives a string containing the sentinel substring

#### Scenario: Parse failure on 200 still returns rawText verbatim

- **WHEN** the adapter receives a `200` whose body lacks a parseable shot
- **THEN** the adapter returns a `ProviderCallOutput` whose `rawText` equals the provider's user-visible text verbatim (reasoning stripped), so the engine's `parseShot` can classify it as a schema error

### Requirement: Provider registry composes real adapters and the mock

`backend/src/providers/index.ts` SHALL assemble a registry mapping provider ids to `ProviderAdapter` instances, wiring real adapters with `globalThis.fetch` and the real pricing module. The production registry MUST omit the mock adapter from the picker surface exposed via `GET /api/providers`, while keeping the mock registrable for test builds and the staging build that enables Playwright smoke.

#### Scenario: Production registry contains real adapters only in the picker surface

- **WHEN** the production registry is constructed and `listPickerProviders()` (or equivalent) is queried
- **THEN** the returned set contains `openrouter` and `opencode-go` and does not contain `mock`

#### Scenario: Test registry can include the mock

- **WHEN** a test build constructs its own registry via the same factory with a test-provided mock adapter
- **THEN** calling the registry by id `mock` returns the supplied mock adapter
