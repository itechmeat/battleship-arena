## Context

BattleShipArena has evolved from a basic game loop into an experiment surface for comparing LLM play, provider behavior, reasoning usage, and cost. The requested changes span the start form, persisted run metadata, provider/model catalog, leaderboard grouping, live run page, replay page, and shared contracts.

The implementation must preserve two product constraints: API keys are never sent anywhere except `POST /api/runs`, and the model must remain responsible for choosing shots. Reasoning is now an explicit run dimension, so a run with reasoning enabled and the same model without reasoning must be treated as a different leaderboard cohort.

## Goals / Non-Goals

**Goals:**

- Persist the user's API key locally per provider and prefill/swap it in the start form.
- Add a reasoning control that can be user-selectable or forced by provider/model metadata.
- Store reasoning mode on runs and expose it through API/shared data models.
- Split leaderboard rows and filters by reasoning state.
- Simplify home/live/replay UI around useful state and remove redundant information.
- Centralize displayed USD rounding to thousandths.

**Non-Goals:**

- No authentication or server-side API-key storage.
- No new external UI library.
- No change to Battleship rules or candidate generation semantics.
- No change to provider pricing rates beyond metadata needed for reasoning control.

## Decisions

### Reasoning mode model

Represent reasoning as a boolean persisted on each run (`reasoning_enabled`) and exposed as `reasoningEnabled` in shared/API models. Provider catalog entries will additionally expose a control policy: `reasoningMode: "optional" | "forced_on" | "forced_off"`. The start form derives the checkbox value and disabled state from this policy.

Alternative considered: store a tri-state on runs. Rejected because a concrete run always executes with reasoning either enabled or disabled; the forced/optional distinction belongs to model metadata, not historical run rows.

### API key storage

Store API keys in browser `localStorage` using a provider-scoped key. The value is written when the user changes/submits the field and read only by the start form. Changing provider swaps the input to that provider's saved key or empty string.

Alternative considered: store by model. Rejected because API keys are provider credentials and model-level storage creates unnecessary duplication.

### Leaderboard partitioning

Add `reasoning_enabled` to both today and all-time grouping/dedup partition keys after provider/model. Add an optional `reasoningEnabled` query filter and `reasoningEnabled` field on every row.

Alternative considered: show reasoning as metadata only. Rejected because mixing reasoning and non-reasoning wins for one model would make rankings ambiguous.

### Live game UI

Keep the board and telemetry as the main surface, but remove redundant model/outcome blocks. The page title and visible heading become stateful: title reflects in-progress/finished, heading is `Battleship: <model_name>`, and terminal outcome moves into the timer/status area.

### Replay UI

Replay should reuse the game screen's visual primitives and width constraints so live and replay feel like two modes of the same surface. The progress bar sits above controls and is disabled during playback to prevent contradictory input while the reducer advances automatically.

## Risks / Trade-offs

- Existing databases lack `reasoning_enabled` -> add a migration with a safe default, likely `true` for historical reasoning-capable runs unless provider/model metadata can determine a better value.
- `localStorage` is browser-only -> guard accesses so SSR/tests do not crash.
- Provider metadata may not perfectly describe every upstream model -> default conservatively and protect request-shape behavior with tests.
- Leaderboard query changes can alter historical rankings -> expected and required because reasoning is now part of the cohort identity.
- Replay/live UI reuse can create coupling -> prefer small shared formatting/layout helpers rather than merging state machines.
