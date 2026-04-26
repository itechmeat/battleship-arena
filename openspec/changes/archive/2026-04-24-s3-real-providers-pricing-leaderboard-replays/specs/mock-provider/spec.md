## ADDED Requirements

### Requirement: Mock adapter accepts a test-only testHooks options bag

The `createMockProvider` factory SHALL accept an optional `testHooks` field on its options argument with the shape `{ costUsdMicros?: number; tokensIn?: number; tokensOut?: number; reasoningTokens?: number | null; failure?: "transient" | "unreachable" | null }`. When `testHooks` is absent or `undefined`, the adapter MUST behave exactly as it did in S2: every call returns `tokensIn = 0`, `tokensOut = 0`, `reasoningTokens = null`, `costUsdMicros = 0`, and the adapter MUST NOT throw a `ProviderError`. When `testHooks.costUsdMicros` is supplied, the adapter MUST report that exact integer value as `costUsdMicros` on every successful call. When `testHooks.tokensIn`, `testHooks.tokensOut`, or `testHooks.reasoningTokens` are supplied, the adapter MUST report those exact values on every successful call. When `testHooks.failure === "transient"`, the adapter MUST throw `ProviderError { kind: "transient", cause: <string> }` instead of returning a result, on every call for the lifetime of the adapter instance. When `testHooks.failure === "unreachable"`, the adapter MUST throw `ProviderError { kind: "unreachable", cause: <string>, status: <number> }` instead of returning a result, on every call. The production backend bootstrap path MUST NOT pass `testHooks`; `testHooks` is reserved for integration tests and the staging-only mock-cost knob documented in the runs API.

#### Scenario: Cost override is reported verbatim

- **WHEN** `createMockProvider({ testHooks: { costUsdMicros: 4_000 } }).call(...)` resolves
- **THEN** the returned `ProviderCallOutput` has `costUsdMicros === 4_000`

#### Scenario: Token override is reported verbatim

- **WHEN** `createMockProvider({ testHooks: { tokensIn: 120, tokensOut: 8, reasoningTokens: 50 } }).call(...)` resolves
- **THEN** the returned `ProviderCallOutput` has `tokensIn === 120`, `tokensOut === 8`, and `reasoningTokens === 50`

#### Scenario: Transient failure throws ProviderError of kind transient

- **WHEN** `createMockProvider({ testHooks: { failure: "transient" } }).call(...)` is invoked
- **THEN** the returned promise rejects with a value that satisfies `err.kind === "transient"` and carries a non-empty `cause` string

#### Scenario: Unreachable failure throws ProviderError of kind unreachable

- **WHEN** `createMockProvider({ testHooks: { failure: "unreachable" } }).call(...)` is invoked
- **THEN** the returned promise rejects with a value that satisfies `err.kind === "unreachable"`, carries a non-empty `cause` string, and carries a numeric `status`

#### Scenario: Absent testHooks preserves S2 defaults

- **WHEN** `createMockProvider({}).call(...)` resolves for any model variant
- **THEN** the returned `ProviderCallOutput` has `tokensIn === 0`, `tokensOut === 0`, `reasoningTokens === null`, `costUsdMicros === 0`, and no `ProviderError` is thrown
