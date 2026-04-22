## ADDED Requirements

### Requirement: /play page with provider + model picker, API key, budget, submit

The `web/` workspace SHALL add `web/src/pages/play.astro` that renders a single `<StartRunForm client:load>` Solid island. The island MUST expose four controls: a provider `<select>` (S2a: only `mock` available), a model `<select>` (S2a: `mock-happy` default, `mock-misses`, `mock-schema-errors`), a password-type API key input with `autocomplete="off"` and no default value, a number input for budget (optional, positive). On submit the island MUST call `startRun({ providerId, modelId, apiKey, budgetUsd? })` via `lib/api.ts`, navigate to `/runs/<runId>` on success, and display the server's error message inline on failure. The submit button MUST gain `aria-busy` and the `disabled` attribute during an in-flight request.

#### Scenario: Submit with mock-happy navigates to the run page

- **WHEN** a user opens `/play`, selects `mock` and `mock-happy`, enters a non-empty API key, and clicks Start
- **THEN** the browser navigates to `/runs/<returned-runId>` after the backend returns 200

#### Scenario: Server-side validation error renders inline

- **WHEN** the server responds with a 400 `invalid_input` envelope
- **THEN** the island renders the envelope's message inline above the form and does not navigate

#### Scenario: API key field is password-type with no autocomplete

- **WHEN** the rendered form is inspected
- **THEN** the API key input has `type="password"` and `autocomplete="off"`

### Requirement: /runs/:id page with live SSE view

The `web/` workspace SHALL add `web/src/pages/runs/[id].astro` that renders `<LiveGame runId={id} client:load>`. The island MUST mount with a four-phase state machine (`loading`, `live`, `terminal`, `error`) backed by typed `GET /api/runs/:id`, `GET /api/runs/:id/shots`, and SSE subscription via `lib/sse.ts`. On mount the island MUST fetch run meta first; if `outcome !== null` it transitions directly to `terminal` after fetching shots; otherwise it hydrates shots then opens an `EventSource` to `/api/runs/:id/events?lastEventId=<latestIdx>`. The island MUST handle the SSE `resync` event by closing and re-running the mount sequence. The island MUST render the board via `<BoardView shots={shots()} />` and a small HUD showing shots/hits/schemaErrors/invalidCoordinates/outcome. The island MUST offer an Abort button while `phase === "live"` that calls `POST /api/runs/:id/abort`.

#### Scenario: Full mock-happy flow renders to terminal without reload

- **WHEN** a user submits `/play` with `mock-happy` and is navigated to `/runs/<id>`
- **THEN** the board updates incrementally as SSE events arrive and a terminal indicator reads `won` without any page reload

#### Scenario: Reload mid-run resumes from ring

- **WHEN** a user reloads `/runs/<id>` while a mock run with visible pacing is in progress
- **THEN** the island re-fetches meta + shots, re-opens SSE with the latest shot idx, and continues rendering subsequent shots

#### Scenario: Resync triggers a hydration cycle

- **WHEN** the SSE stream emits `event: resync` (for example because the ring rolled past the client's `Last-Event-ID`)
- **THEN** the island closes the EventSource, re-fetches `/api/runs/:id` and `/api/runs/:id/shots`, and re-subscribes with the newest idx

#### Scenario: Abort button stops an active run

- **WHEN** a user clicks Abort while `phase === "live"`
- **THEN** the island POSTs `/api/runs/:id/abort`, the persisted outcome becomes `aborted_viewer`, and the island transitions to `terminal`

### Requirement: BoardView island derives cells from shots (pure)

The `web/` workspace SHALL expose a Solid `<BoardView shots={RunShotRow[]} />` island plus a pure helper `boardViewFromShots(shots)` that maps the shot list to a 100-cell `BoardView`. The helper MUST: place every `miss`, `hit`, and `sunk` shot at `row * 10 + col` (skipping rows with `null` row/col from schema errors); for every `sunk` result, upgrade adjacent `hit` cells in all four cardinal directions to `sunk` by flood along `row` or `col` until a non-`hit`/`sunk` cell is reached. The island MUST render by passing the derived view to the shared `renderBoardSvg` and injecting the SVG via `innerHTML`. No DOM-level state is held inside the helper.

#### Scenario: Empty shots yield all-unknown board

- **WHEN** `boardViewFromShots([])` is called
- **THEN** the returned `cells` array contains 100 `"unknown"` entries

#### Scenario: Miss and hit placed at row-major index

- **WHEN** `boardViewFromShots` is called with shots at `(1, 1) miss` and `(2, 3) hit`
- **THEN** `cells[11] === "miss"` and `cells[23] === "hit"`

#### Scenario: Sunk upgrades contiguous hits along the same row

- **WHEN** `boardViewFromShots` is called with shots at `(0, 0) hit`, `(0, 1) hit`, `(0, 2) sunk` in that order
- **THEN** `cells[0]`, `cells[1]`, `cells[2]` all equal `"sunk"`

#### Scenario: Null-coordinate shots are skipped

- **WHEN** `boardViewFromShots` is called with a shot whose `row` and `col` are both `null`
- **THEN** every cell in the returned view remains `"unknown"`

### Requirement: Typed API and SSE client libs

The `web/` workspace SHALL expose `web/src/lib/api.ts` with typed functions `startRun`, `getRun`, `getRunShots`, `abortRun`, a typed `ApiError` class wrapping `ErrorEnvelope` plus status, and a shared `fetch` helper that sends `credentials: "same-origin"` so the session cookie rides along. The workspace SHALL expose `web/src/lib/sse.ts` with `subscribeToRun(runId, { lastEventId, onEvent, onResync, onError })` returning a close function; the helper MUST pass `lastEventId` via query parameter on initial connect, handle browser auto-reconnect (which re-sends `Last-Event-ID`), and manually re-open if `EventSource.readyState === CLOSED`.

#### Scenario: ApiError surfaces the envelope

- **WHEN** `startRun` is called against a 400 response
- **THEN** the thrown `ApiError` has an `envelope` field whose `error.code` equals the server's code, plus a `status` field equal to 400

#### Scenario: subscribeToRun sends lastEventId as query param

- **WHEN** `subscribeToRun(runId, { lastEventId: 3, ... })` is called
- **THEN** the underlying `EventSource` URL contains `lastEventId=3` as a query parameter

### Requirement: Mobile-first CSS with no global framework

The `web/` workspace SHALL add `web/src/styles/play.module.css` and `web/src/styles/live-game.module.css` as CSS Modules used by the Solid islands. Both stylesheets MUST constrain content to `max-width: 480px`, center the column via `margin: 0 auto`, and ensure all interactive controls have a `min-height: 44px` to satisfy the touch-target requirement in `docs/spec.md` 7.3. No global CSS framework SHALL be added; no dark-mode or brand-color variables are introduced in S2a.

#### Scenario: Every interactive control meets the 44px touch target

- **WHEN** the rendered `/play` form is measured in a portrait 375x812 viewport
- **THEN** every input, select, and button has a computed box height of at least 44px

#### Scenario: Content is a centered single column

- **WHEN** the rendered `/play` and `/runs/:id` pages are measured at any viewport width
- **THEN** the main content column is at most 480px wide and is horizontally centered

## MODIFIED Requirements

### Requirement: Astro static site with Solid integration

The `web/` workspace SHALL be an Astro package configured with `output: "static"` and MUST have the `@astrojs/solid-js` integration installed and registered in `astro.config.mjs`. The `src/islands/` directory SHALL contain the S2a Solid components `StartRunForm.tsx`, `LiveGame.tsx`, `BoardView.tsx`, and the pure helper `boardViewFromShots.ts`. The S1a `.gitkeep` placeholder MAY be removed once the real islands land.

#### Scenario: Astro config declares static output

- **WHEN** `web/astro.config.mjs` is loaded by Astro during build
- **THEN** the exported config object has `output: "static"` and lists `solidJs()` inside `integrations`

#### Scenario: Islands directory holds the S2a components

- **WHEN** a fresh clone of the repository is inspected after S2a merges
- **THEN** `web/src/islands/` contains `StartRunForm.tsx`, `LiveGame.tsx`, `BoardView.tsx`, and `boardViewFromShots.ts`
