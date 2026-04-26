## Why

The current UI still contains early MVP surfaces that no longer help users understand a run: the home-page board is decorative, live-game state is split across redundant blocks, and replay has drifted visually from the main game screen. At the same time, reasoning is now a meaningful run dimension that must be explicit, persisted, and reflected in leaderboard grouping.

## What Changes

- Remove the non-informative game board from the home page.
- Persist API keys per provider in `localStorage`, prefill the start form, and swap the input value when the provider changes.
- Add a Reasoning checkbox to the start form, including disabled forced states for providers/models that do not allow user control.
- Persist the selected reasoning mode in the database and expose it through run data models and API contracts.
- Split leaderboard rows by provider, model, and reasoning value; add a Reasoning column and a Reasoning filter checkbox.
- Make live-game browser titles reflect whether the game is in progress or finished.
- Rename the live heading to `Battleship: <model_name>`, remove the redundant bottom Model block, and place the renamed `Abort` button beside the timers pinned right.
- Round displayed cost values to thousandths through a shared UI utility.
- Replace the bottom `Outcome: won` block with terminal outcome shown in the timer area using timer styling.
- Shorten the terminal run-complete/replay copy.
- Align replay layout with the main game width, move the progress bar above controls, disable progress while playing, and reuse game-screen UI elements for consistency.

## Capabilities

### New Capabilities

- `reasoning-run-mode`: Captures user-selectable or provider-forced reasoning state as a persisted run dimension.

### Modified Capabilities

- `home-page`: Home-page start and leaderboard surfaces change, including board removal, API-key persistence, reasoning control, and leaderboard reasoning UI.
- `leaderboard`: Aggregation and filtering include reasoning state as a distinct dimension.
- `providers-catalog`: Provider/model metadata must describe whether reasoning is user-controllable or forced on/off.
- `runs-api`: Run creation and run payloads include reasoning state.
- `run-lifecycle`: Stored runs and shot/accounting views include reasoning state and terminal status presentation.
- `shared-contract`: Shared TypeScript/data contracts include reasoning mode fields.
- `web-shell`: Live game layout, headings, page title, abort placement, cost formatting, and terminal messaging are refined.
- `replay-viewer`: Replay layout and controls are aligned with the live game surface.

## Impact

- Backend database schema, queries, run creation, leaderboard aggregation, and API/OpenAPI schemas.
- Shared contracts for provider/model metadata, run payloads, leaderboard rows, and start-run input.
- Web start form, home page, leaderboard table/filter UI, live game page, replay page, and UI utilities.
- Tests for API contracts, persistence, leaderboard grouping, start-form behavior, formatting utilities, live game rendering, and replay behavior.
