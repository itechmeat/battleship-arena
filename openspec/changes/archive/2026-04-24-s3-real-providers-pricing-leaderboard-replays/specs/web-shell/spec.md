## MODIFIED Requirements

### Requirement: /play page with provider + model picker, API key, budget, submit

The `web/` workspace SHALL add `web/src/pages/play.astro` that renders a single `<StartRunForm client:load>` Solid island. The island MUST expose four controls: a provider `<select>`, a model `<select>`, a password-type API key input with `autocomplete="off"` and no default value, and a number input for budget. The provider and model options MUST be populated at hydration time from a `GET /api/providers` fetch; the built bundle MUST NOT carry a hardcoded provider or model catalog beyond what the endpoint returns. Changing the selected provider MUST clear the selected `modelId` until the user picks a model belonging to the newly selected provider; the first model of the newly selected provider MAY be pre-selected. In staging, development, and test builds (for example when `import.meta.env.MODE` resolves to `"staging"`, `"development"`, or `"test"`), the provider `<select>` MUST additionally expose a synthetic `mock` option with its three S2-era model variants (`mock-happy`, `mock-misses`, `mock-schema-errors`) injected client-side so Playwright smoke coverage can still exercise the mock path; this option MUST NOT come from `GET /api/providers`. In production builds, the `mock` option MUST NOT appear in the picker regardless of anything the endpoint returns. The budget input MUST accept an optional non-negative decimal value; empty and `0` MUST be treated as absent by the submit handler (no `budgetUsd` field sent in the request body), while negative values MUST block submission client-side. On submit the island MUST call `startRun({ providerId, modelId, apiKey, budgetUsd? })` via `lib/api.ts`, navigate to `/runs/<runId>` on success, and display the server's error message inline on failure. The submit button MUST gain `aria-busy` and the `disabled` attribute during an in-flight request.

#### Scenario: Provider and model selects populate from GET /api/providers

- **WHEN** a user lands on `/play` and the `GET /api/providers` response contains two real providers, each with their own models
- **THEN** the provider `<select>` renders exactly those two providers in the order returned and the model `<select>` renders the models for the initially selected provider, with no extra entries from any hardcoded bundle list

#### Scenario: Changing provider clears the selected modelId

- **WHEN** a user selects provider `A`, picks model `A-m1`, then switches the provider `<select>` to `B`
- **THEN** the model `<select>` re-renders with provider `B`'s models and the selected `modelId` is either cleared or pre-seeded to the first model of `B`; the previously chosen `A-m1` is no longer reflected in the form state

#### Scenario: Staging build exposes the mock option

- **WHEN** `/play` hydrates under `import.meta.env.MODE === "staging"`
- **THEN** the provider `<select>` contains an additional `mock` entry alongside the entries returned by `GET /api/providers`, and selecting it populates the model `<select>` with `mock-happy`, `mock-misses`, and `mock-schema-errors`

#### Scenario: Production build hides the mock option

- **WHEN** `/play` hydrates under `import.meta.env.MODE === "production"`
- **THEN** the provider `<select>` contains no `mock` entry regardless of whether `GET /api/providers` would have included one

#### Scenario: Submit with a real provider navigates to the run page

- **WHEN** a user opens `/play`, selects a real provider and one of its models, enters a non-empty API key, and clicks Start
- **THEN** the browser navigates to `/runs/<returned-runId>` after the backend returns 200

#### Scenario: Submit with mock-happy on staging still navigates to the run page

- **WHEN** a user on a staging build selects `mock` and `mock-happy`, enters a non-empty API key, and clicks Start
- **THEN** the browser navigates to `/runs/<returned-runId>` after the backend returns 200

#### Scenario: Empty budget input is treated as absent

- **WHEN** a user submits the form with the budget field empty
- **THEN** the `startRun` call body contains no `budgetUsd` field, and the backend persists `runs.budget_usd_micros` as `NULL`

#### Scenario: Zero budget input is treated as absent

- **WHEN** a user submits the form with the budget field set to `0`
- **THEN** the `startRun` call body contains no `budgetUsd` field, and the backend persists `runs.budget_usd_micros` as `NULL`

#### Scenario: Server-side validation error renders inline

- **WHEN** the server responds with a 400 `invalid_input` envelope
- **THEN** the island renders the envelope's message inline above the form and does not navigate

#### Scenario: API key field is password-type with no autocomplete

- **WHEN** the rendered form is inspected
- **THEN** the API key input has `type="password"` and `autocomplete="off"`
