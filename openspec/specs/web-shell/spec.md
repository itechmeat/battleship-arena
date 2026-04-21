# web-shell Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: Astro static site with Solid integration

The `web/` workspace SHALL be an Astro package configured with `output: "static"` and MUST have the `@astrojs/solid-js` integration installed and registered in `astro.config.mjs`. An `src/islands/` directory MUST exist as a placeholder for S2 Solid islands; it SHALL contain a `.gitkeep` file and no source modules so that Solid is wired but inert in S1a.

#### Scenario: Astro config declares static output

- **WHEN** `web/astro.config.mjs` is loaded by Astro during build
- **THEN** the exported config object has `output: "static"` and lists `solidJs()` inside `integrations`

#### Scenario: Empty islands directory is tracked in git

- **WHEN** a fresh clone of the repository is inspected
- **THEN** `web/src/islands/.gitkeep` exists and `web/src/islands/` contains no other source files

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
