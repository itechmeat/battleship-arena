## ADDED Requirements

### Requirement: Start form persists API keys per provider

The `/play` start form SHALL save API keys in browser `localStorage` by provider id after the API-key field change is committed or when the form is submitted, and prefill the API key input from the selected provider's saved value. Changing provider MUST swap the input value to that provider's saved key or an empty string.

#### Scenario: Saved provider key prefills input

- **WHEN** localStorage contains a key for the selected provider and the start form hydrates
- **THEN** the API key input is prefilled with that saved value

#### Scenario: Provider change swaps key value

- **WHEN** a user changes from provider A to provider B
- **THEN** the API key input changes to provider B's saved key, or empty if none exists

### Requirement: Start form exposes Reasoning checkbox

The `/play` start form SHALL include a Reasoning checkbox whose checked and disabled state derives from the selected model's `reasoningMode` metadata.

#### Scenario: Optional model enables checkbox

- **WHEN** the selected model has `reasoningMode === "optional"`
- **THEN** the Reasoning checkbox is enabled, checked by default, and its submitted value is included in `startRun`

#### Scenario: Forced model disables checkbox

- **WHEN** the selected model has `reasoningMode === "forced_on"` or `"forced_off"`
- **THEN** the checkbox is disabled and preset to the forced value

### Requirement: Live page title and heading reflect run state

The `/runs/:id` page SHALL update `document.title` to show whether the game is in progress or finished. The visible heading SHALL show `Battleship` with the model name on a new line in a smaller font size. The page SHALL show `Reasoning: <status>` below the model name at normal font size.

#### Scenario: Live title shows in progress

- **WHEN** a run has no terminal outcome
- **THEN** the page title indicates the game is in progress

#### Scenario: Terminal title shows finished

- **WHEN** a run has a terminal outcome
- **THEN** the page title indicates the game is finished

#### Scenario: Visible heading separates model name

- **WHEN** run metadata has loaded
- **THEN** the visible heading shows `Battleship` and renders the model name on the next line with smaller text

#### Scenario: Reasoning appears under model name

- **WHEN** run metadata has loaded
- **THEN** the visible title area shows `Reasoning: On` or `Reasoning: Off`

### Requirement: Missing run shows 404 page

The `/runs/:id` client view SHALL show a 404-style not-found page when the run metadata endpoint returns `run_not_found`. It MUST NOT render the empty game board for missing runs.

#### Scenario: Missing run does not show game board

- **WHEN** `/api/runs/:id` returns 404 for the requested run
- **THEN** the run page shows a not-found message and no game board or metrics grid

### Requirement: Live game layout removes redundant model block and repositions abort

The live game UI SHALL remove the bottom Model and Reasoning blocks. While live, the Abort button text SHALL be `Abort` and the button SHALL appear to the right of the timers pinned to the right edge of the timer row.

#### Scenario: Abort button is short and aligned

- **WHEN** a run is live
- **THEN** the visible abort control reads `Abort` and appears on the right side of the timer row

### Requirement: Displayed costs use thousandth precision utility

The web UI SHALL use a shared utility to format displayed USD cost values rounded to thousandths.

#### Scenario: Cost rounds to thousandths

- **WHEN** the utility formats `1234` USD micros
- **THEN** it returns a display value rounded to `$0.001`

### Requirement: Terminal run copy is concise

The live page SHALL replace the verbose terminal message `Run complete. The board now reflects the terminal shot log. Open replay` with shorter copy.

#### Scenario: Terminal copy is short

- **WHEN** a run reaches terminal state
- **THEN** the terminal message is concise and still links to replay
