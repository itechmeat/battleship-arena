# web-shell Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: Astro static site with Solid integration

The `web/` workspace SHALL be an Astro package configured with `output: "static"` and MUST have the `@astrojs/solid-js` integration installed and registered in `astro.config.mjs`. The `src/islands/` directory SHALL contain the S2a Solid components `StartRunForm.tsx`, `LiveGame.tsx`, `BoardView.tsx`, and the pure helper `boardViewFromShots.ts`. The S1a `.gitkeep` placeholder MAY be removed once the real islands land.

#### Scenario: Astro config declares static output

- **WHEN** `web/astro.config.mjs` is loaded by Astro during build
- **THEN** the exported config object has `output: "static"` and lists `solidJs()` inside `integrations`

#### Scenario: Islands directory holds the S2a components

- **WHEN** a fresh clone of the repository is inspected after S2a merges
- **THEN** `web/src/islands/` contains `StartRunForm.tsx`, `LiveGame.tsx`, `BoardView.tsx`, and `boardViewFromShots.ts`

### Requirement: PWA manifest declares identity, display, and three icons

`web/public/manifest.webmanifest` SHALL be a valid JSON document with `name` equal to `"BattleShipArena"`, `short_name` equal to `"Arena"`, `start_url` equal to `"/"`, `display` equal to `"standalone"`, a `background_color`, a `theme_color`, and an `icons` array with at least three entries: a 192x192 PNG, a 512x512 PNG, and a 512x512 PNG with `purpose: "maskable"`.

#### Scenario: Manifest parse test asserts required fields

- **WHEN** `bun test web/tests/manifest.test.ts` runs against the committed manifest
- **THEN** the test reads `web/public/manifest.webmanifest`, parses it as JSON, and asserts `name === "BattleShipArena"`, `short_name === "Arena"`, `start_url === "/"`, `display === "standalone"`, `icons.length >= 3`, and that at least one icon has `purpose === "maskable"`

#### Scenario: Theme and background colors are present

- **WHEN** the manifest JSON is inspected
- **THEN** both `theme_color` and `background_color` are defined as non-empty strings

### Requirement: Pre-made icons shipped in the repository

The repository SHALL ship three pre-generated PNG icon files at `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`, and `web/public/icons/maskable-512.png`, plus a single SVG source at `web/public/icons/source.svg`. The production build pipeline MUST NOT depend on any runtime or build-time icon-generation tool; the SVG source is retained only for future manual regeneration.

#### Scenario: Icon files exist in the committed tree

- **WHEN** a fresh clone of the repository is inspected
- **THEN** all four files exist: `web/public/icons/source.svg`, `web/public/icons/icon-192.png`, `web/public/icons/icon-512.png`, `web/public/icons/maskable-512.png`

#### Scenario: Production build does not invoke an icon generator

- **WHEN** `bun --filter web run build` runs in CI with no extra tooling installed beyond the pinned devDependencies
- **THEN** the build completes successfully and produces the three PNG icons in `web/dist/icons/` by copying them from `web/public/icons/`, without calling any SVG-to-PNG converter

### Requirement: Index page links the manifest and registers the SW only in production

The root page at `web/src/pages/index.astro` SHALL include a `<link rel="manifest" href="/manifest.webmanifest">` in the document head and an inline `<script is:inline>` that registers `/sw.js` only when `import.meta.env.PROD` is true. The page MUST import at least one type from the shared contract package so the Astro build exercises the workspace dependency.

#### Scenario: Manifest link is present in rendered HTML

- **WHEN** the built `web/dist/index.html` is inspected after `bun --filter web run build`
- **THEN** the head contains a `<link rel="manifest" href="/manifest.webmanifest">` element

#### Scenario: Service worker registration is gated on production builds

- **WHEN** the inline script in `index.astro` is evaluated during `astro dev` (where `import.meta.env.PROD` is false)
- **THEN** no call to `navigator.serviceWorker.register` is executed

#### Scenario: Service worker registers in production bundle

- **WHEN** the inline script in the built `web/dist/index.html` is evaluated in a browser
- **THEN** the script calls `navigator.serviceWorker.register("/sw.js")` inside a `load` event listener, guarded by a `"serviceWorker" in navigator` feature check

### Requirement: Service worker caches the shell and bypasses API + non-GET traffic

The service worker compiled from `web/src/pwa/sw.ts` to `web/dist/sw.js` SHALL receive a shell manifest at build time listing fingerprinted HTML, CSS, JS, font, icon, and `.webmanifest` URLs. On `install` it MUST open a cache named after its version tag and call `cache.addAll` with exactly those URLs. On `fetch` it MUST serve cached responses for GET requests whose URL pathname appears in the shell manifest, and MUST pass every `/api/*` request and every non-GET request straight through to the network without consulting the cache.

#### Scenario: Install populates the shell cache

- **WHEN** the service worker's `install` event fires in a browser after a fresh install
- **THEN** a cache named with the service worker's version tag is created and populated with the exact set of shell URLs from the inlined manifest

#### Scenario: GET request for a shell URL is served from cache

- **WHEN** the browser issues a GET request for a URL listed in the shell manifest
- **THEN** the service worker responds with the cached response and only falls back to `fetch(request)` if no cached entry is present

#### Scenario: API request bypasses the service worker

- **WHEN** the browser issues a GET `/api/health` request or a POST to any `/api/*` path
- **THEN** the service worker's fetch handler returns without calling `event.respondWith`, letting the browser make the network request directly

#### Scenario: Non-GET request bypasses the cache

- **WHEN** the browser issues any request whose method is not GET (for example POST, PUT, DELETE)
- **THEN** the service worker does not match the request against the shell manifest and does not serve a cached response

### Requirement: Service worker versioning rotates caches on redeploy

The service worker SHALL include a version tag in its cache name so successive builds produce distinct cache identifiers. On the `activate` event it MUST enumerate all existing cache names and delete every cache whose name does not match the current version, ensuring a redeploy fully replaces the prior shell.

#### Scenario: Old caches are deleted during activate

- **WHEN** a new service worker version activates with a different version tag than its predecessor
- **THEN** the activate handler iterates `caches.keys()` and calls `caches.delete` on every key that is not the current cache name

#### Scenario: Cache name encodes the version

- **WHEN** the compiled `web/dist/sw.js` is inspected
- **THEN** the cache name is derived from a version tag that changes between builds, so two successive builds never share the same cache name

### Requirement: Build output contains the PWA artifacts

`bun --filter web run build` SHALL produce a `web/dist/` directory containing at minimum `index.html`, `manifest.webmanifest`, `sw.js`, and the three icon PNG files. A manifest parse test MUST run as part of `bun test` and assert that the required PWA fields are still present after any future edit to the manifest.

#### Scenario: Fresh build emits all required files

- **WHEN** `bun --filter web run build` runs on a clean checkout
- **THEN** `web/dist/index.html`, `web/dist/manifest.webmanifest`, `web/dist/sw.js`, `web/dist/icons/icon-192.png`, `web/dist/icons/icon-512.png`, and `web/dist/icons/maskable-512.png` all exist

#### Scenario: Manifest contract test guards against drift

- **WHEN** a developer modifies `web/public/manifest.webmanifest` and re-runs `bun test`
- **THEN** the manifest parse test fails unless `name`, `short_name`, `start_url`, `display`, at least three icons, and at least one maskable icon are still present

### Requirement: Dynamic data is never cached by the service worker

The service worker SHALL never cache leaderboard data, run state, shot lists, SSE event streams, or any other response served from `/api/*`. The "skip `/api/*`" rule MUST appear explicitly in the fetch handler as a URL pathname check that returns before any cache lookup, and this behavior MUST be observable without reading the source by comparing cache contents to network traffic.

#### Scenario: Fetch handler short-circuits on /api/ prefix

- **WHEN** the fetch handler in `web/src/pwa/sw.ts` receives a request whose URL pathname starts with `/api/`
- **THEN** the handler returns immediately without calling `caches.match`, `caches.open`, or `event.respondWith`

#### Scenario: SSE event stream is never intercepted

- **WHEN** the browser opens an `EventSource` connection to an `/api/runs/:id/events` endpoint in a production build
- **THEN** the service worker does not intercept the stream and the connection is served live from the network on every page load

#### Scenario: Leaderboard and run payloads are fetched live

- **WHEN** the browser requests any `/api/*` JSON endpoint (for example a leaderboard list or a run state query) in a production build
- **THEN** the response is fetched from the network on every request and no entry for that URL appears in any service-worker cache

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
