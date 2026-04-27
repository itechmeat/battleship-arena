## 1. OpenSpec And Baseline

- [x] 1.1 Create and validate the `refactor-frontend-architecture` OpenSpec artifacts.
- [x] 1.2 Map current frontend responsibilities across pages, islands, lib modules, and tests.
- [x] 1.3 Identify behavior-preserving extraction points before editing UI code.

## 2. Shared Frontend Libraries

- [x] 2.1 Extract shared API/error helpers and URL builders where they reduce duplication.
- [x] 2.2 Extract browser storage, dynamic route-id resolution, and service-worker registration helpers.
- [x] 2.3 Add focused tests for extracted shared frontend library behavior.

## 3. Start Run Form Refactor

- [x] 3.1 Move mock provider metadata, catalog selection, reasoning-mode helpers, and budget parsing out of `StartRunForm.tsx`.
- [x] 3.2 Refactor `StartRunForm.tsx` to use the extracted helpers while preserving form labels, local-storage keys, request payloads, and navigation behavior.
- [x] 3.3 Update or add focused tests for start-run helper behavior.

## 4. Live Game Refactor

- [x] 4.1 Extract live-run state helpers for shot merging, SSE shot conversion, terminal diagnostics, phase labels, and error classification.
- [x] 4.2 Refactor `LiveGame.tsx` to delegate pure logic to those helpers while preserving live stream lifecycle and UI behavior.
- [x] 4.3 Update or add focused tests for live-run helper behavior.

## 5. Leaderboard And Replay Refactor

- [x] 5.1 Extract leaderboard filter/view-model helpers and keep API query behavior unchanged.
- [x] 5.2 Extract replay route/loading/view-model helpers where they clarify `ReplayPlayer.tsx` without changing playback semantics.
- [x] 5.3 Update or add focused tests for leaderboard and replay helper behavior.

## 6. Astro Page Shell Refactor

- [x] 6.1 Centralize repeated Astro page constants and service-worker registration script helpers.
- [x] 6.2 Refactor home, play, live-run, and replay pages to use the shared shell helpers while preserving rendered behavior.

## 7. Verification

- [x] 7.1 Run web unit tests.
- [x] 7.2 Run web typecheck and build when frontend pages/islands change.
- [x] 7.3 Run formatting/lint checks, OpenSpec validation, and code checker.
- [x] 7.4 Review changed files for accidental behavior or UI changes.
