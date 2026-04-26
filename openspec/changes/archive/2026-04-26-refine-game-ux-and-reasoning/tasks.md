## 1. Data Model And Contracts

- [x] 1.1 Add reasoning mode metadata to provider pricing/catalog models and `GET /api/providers` shared types.
- [x] 1.2 Add persisted `reasoning_enabled` to runs schema, migrations, query mappings, and fixtures.
- [x] 1.3 Add `reasoningEnabled` to shared `StartRunInput`, `RunMeta`, `LeaderboardRow`, OpenAPI, and API client contracts.

## 2. Backend API And Leaderboard

- [x] 2.1 Accept and validate `reasoningEnabled` in `POST /api/runs`, resolving forced model policies server-side.
- [x] 2.2 Thread resolved reasoning state through manager/engine/provider call input without storing API keys.
- [x] 2.3 Partition and filter leaderboard rows by `reasoning_enabled`, including response fields and query tests.

## 3. Start And Home UI

- [x] 3.1 Remove the decorative board preview from the home page while preserving the start CTA and leaderboard skeleton.
- [x] 3.2 Persist API keys per provider in `localStorage`, prefill on load, and swap values on provider change.
- [x] 3.3 Add the Reasoning checkbox to the start form with optional/forced behavior, default-on optional models, and submit wiring.
- [x] 3.4 Add the Reasoning leaderboard filter and column on the home page.

## 4. Live Game UI

- [x] 4.1 Update the browser title to show run state and split the visible `Battleship` / model-name heading.
- [x] 4.2 Remove the bottom Model block and move the renamed `Abort` button into the timer row pinned right.
- [x] 4.3 Add a shared thousandth-precision cost formatting utility and use it in live/replay displays.
- [x] 4.4 Replace the bottom outcome block with terminal outcome in place of the shot timer and shorten replay copy.
- [x] 4.5 Show a 404-style page for missing runs instead of an empty game board.

## 5. Replay UI

- [x] 5.1 Match replay content width to the live game page.
- [x] 5.2 Move replay progress above controls and disable it while playing.
- [x] 5.3 Reuse live-game board/metric styling primitives where practical so replay and live pages look consistent.

## 6. Validation

- [x] 6.1 Add/update backend and shared tests for reasoning persistence, provider policy, run metadata, and leaderboard grouping/filtering.
- [x] 6.2 Add/update web tests for localStorage key behavior, reasoning checkbox policy, cost formatting, live layout, and replay controls.
- [x] 6.3 Run formatting, typecheck, affected package tests, full `DATABASE_PATH=:memory: bun test`, and `code_checker`.
