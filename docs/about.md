# About BattleShipArena

## The problem

Public LLM benchmarks tend to measure the wrong things for the wrong reasons. They ask one-shot trivia, grade on exact-match against a static answer key, and quietly drift out of date as the test questions seep into the next round of training data. Most of them also hide the interesting part: how a model actually behaves over many turns, with imperfect information, a visual input, and a strict output contract it has to keep honoring or lose the game.

Battleship is a small, legible, adversarial game that exposes exactly those behaviors. A player cannot see the opponent's board, has to reason about where ships can and cannot be, has to update that reasoning after every shot, and has to return each move in a rigid machine-checkable format or the game stops. That makes it a surprisingly sharp probe for a modern LLM: spatial reasoning from an image, long-horizon state tracking, calibration under uncertainty, and instruction-following discipline, all at once.

The gap this project fills is a public, reproducible, low-friction way to watch any LLM play that game under identical conditions, and to compare the results honestly over time.

## What it is

BattleShipArena is a mobile-first web app that lets anyone pick an LLM provider and a specific model, plug in their own API key, and start a Battleship game in which that model is the player and the human is the spectator. A single board is generated per day and is identical for every player on the planet during that day; every model plays that same board, every run is scored on shots taken, hits, duration, tokens, cost, reasoning usage, and how often the model produced an invalid response. Results feed a public leaderboard pinned to the provider's exact model identifier, so historical scores remain honest even when a provider silently updates a model behind the same display name.

Every run is a persistent object with an explicit outcome: won, stalled on repeated format errors, exhausted the user's API budget, ran out of shots, or was aborted by the viewer. The headline leaderboard shows wins ranked by shots-to-sink; the same underlying data also powers honest failure-mode views ("which models can't keep a schema for more than 20 turns?").

The live game is streamed shot-by-shot to whoever is watching, but the run itself executes independently of any open tab. When a run finishes, it becomes a replay that anyone can open from the leaderboard, scrub through, and share by link. The leaderboard is a gallery of those replays, not just a table of numbers.

## What it is not

- **Not a multiplayer game.** The model is always the player. The human only watches and pays for the tokens. There is no human-vs-model, no model-vs-model live, and no chat interaction once a run starts.
- **Not a login product.** No registration, no accounts, no social features, no profiles, no invitations. A leaderboard row is owned by a (provider, exact model ID) pair, not by a user.
- **Not a key broker.** Users bring their own API key each session; the key is used to make provider calls on the user's behalf and is never written to any durable store. Nothing that identifies a user's key survives the end of the session.
- **Not a model-routing or provider-abstraction service.** BattleShipArena does not attempt to paper over provider differences; each provider is exposed on its own terms, and the benchmark makes the differences visible rather than hiding them.
- **Not a training dataset generator.** Games, reasoning, and prompts are not offered as a corpus for fine-tuning, nor packaged for that purpose.
- **Not a real-money competition.** There are no prizes, no wagers, no payments, and no monetization of users. The only cost anyone pays is the provider tokens their own key burns.

## How it is used

1. A visitor opens the app on a phone (primarily) or any browser.
2. They choose a provider and an exact model offered by that provider, and paste their API key into the session.
3. They press start. The backend begins a run against the current day's board: it shows the model the current state of the board as an image, asks for the next shot in a machine-readable shape, applies the shot, and loops until the fleet is sunk, the game's termination conditions fire, or the user cancels.
4. While the run is live, the viewer sees each shot land in near-real-time, with running counters for shots fired, hits, misses, duration, tokens used, and estimated spend.
5. When the run ends, it is saved as a replay with its final outcome tag and metrics. The viewer can share a link to that replay, look at how other models have played the same day's board, or try another (provider, model) pair.
6. Returning visitors on another day see the leaderboard, can open any past run as a replay, and can play today's board themselves with any supported model.

Spectating does not require an API key. Only starting a run does.

## Key properties

### Fairness within a day, durability across years

The board rotates once per UTC day. Everyone who plays on a given day plays an identical layout, which makes same-day comparisons exact. The rotation buys the benchmark resistance to contamination: by the time a specific board has plausibly leaked into training or forum posts, it is no longer the one being scored. All-time ranking aggregates many daily boards, so no single seed determines a model's standing.

**Why this over an eternal fixed board:** a permanently fixed layout is simpler on day one and poisoned on day one-hundred-eighty. Once it appears in scraped content or a user's system prompt, every score afterward is suspect and there is no way to recover. A daily seed is the smallest change that keeps the fairness story ("same board for everyone, right now") and gives the benchmark a shelf life measured in years.

### Every run persists, labeled by outcome

A run is never silently discarded. Wins are recorded with full metrics. Stalls, budget exhaustion, schema-error DNFs, and user-initiated aborts are recorded too, each with a distinct outcome tag. The leaderboard's headline view filters to wins by shots-to-sink; the richer data is available for anyone who wants to see how models actually fail, not just who wins.

**Why this over a wins-only leaderboard:** failure modes are the most interesting data a benchmark like this can produce. A model that cannot keep a valid response schema for thirty turns is a first-class finding, not a void in the record. Keeping aborts as a distinct state (separate from model failures) also protects fairness: a flaky network or a closed tab should not stain the model's row.

### Live if you are watching, archived if you are not

A run is a first-class persistent object, not a function of a browser tab. While it is in progress, viewers see a live per-shot stream. When it finishes, it becomes a replay anyone can open later. The leaderboard is made of those replays: click a score, see the game.

**Why this over live-only or replay-only:** the product is mobile-first, so a run that dies when the tab is backgrounded is non-viable. But the live feed is the feature people actually share. The combination is a superset: live tension when the viewer stays, guaranteed completion and archival when they leave, and replays that let the leaderboard act as a gallery rather than a table.

### Leaderboard identity is the exact model ID, not the display name

Every leaderboard row is pinned to the provider's exact model identifier (including revision suffixes), not the marketing name. Within a single daily seed, only a user's best run feeds the board, so retrying the same seed many times cannot buy a better rank. All-time ranking aggregates across many seeds.

**Why this over collapsing by display name:** providers change the weights behind a name without renaming it. Scores from before and after a silent update are not comparable, and any benchmark that pretends otherwise is quietly lying. Pinning to exact IDs is the only honest way to keep historical numbers meaningful. Best-per-seed defeats the "keep rolling dice until lucky" attack cheaply, without requiring a minimum-runs threshold that would delay new releases from appearing on the board.

### The user is the payer, and nothing else

The user supplies a provider API key for each run, and that key is used only to talk to the provider the user chose, only for the duration of the session, and is never written anywhere that outlives the session. There is no user account, no persistent identity, no telemetry tying a run's cost or key to a person. The only durable artifact of a user is an anonymous run.

**Why this over stored keys or accounts:** storing provider keys, even "conveniently", turns the product into a credential target and forces trust decisions the project explicitly does not want to ask for. Ephemeral in-session use keeps the threat model small and the promise to users legible.

### Mobile-first, public, no-friction

The intended use is: open a link on a phone, pick a model, paste a key, watch. The leaderboard and replays are readable without a key. Nothing about the product is gated behind login, install, or a paid tier of its own.
