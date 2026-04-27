# board-preview Specification

## Purpose

Specifies the public `GET /api/board` endpoint that returns the fixed default benchmark Battleship board as a PNG, or an explicit custom seed board when `date` is provided. The endpoint powers the home-page preview, archived-run replays that want to display the seed's visual starting state, and external verifiability. Scope: past or present UTC seeds only for explicit dates; malformed and explicit future dates reject with `invalid_input`. The absent-date fixed default seed is always allowed. Cache discipline is explicit because the default benchmark seed is fixed.

## Requirements

### Requirement: GET /api/board?date=YYYY-MM-DD returns the PNG for any past or present UTC seed

`GET /api/board` SHALL accept an optional `date` query parameter in `YYYY-MM-DD` form. Past and present UTC seeds MUST return `200` with `Content-Type: image/png` and a non-empty body produced by the `board/generator` and `board/renderer` modules with an empty shots list. An absent `date` MUST be treated as the fixed default benchmark seed (`2026-04-21`) and MUST NOT be rejected by explicit future-date validation.

#### Scenario: Past date returns 200 image/png

- **WHEN** a client issues `GET /api/board?date=2026-04-20`
- **THEN** the response status is `200`, `content-type` is `image/png`, and the body length is greater than zero

#### Scenario: Same date twice returns byte-identical bodies

- **WHEN** a client issues `GET /api/board?date=2026-04-20` twice
- **THEN** the two response bodies are byte-identical

#### Scenario: Absent date maps to the default benchmark seed

- **WHEN** a client issues `GET /api/board` with no query parameters
- **THEN** the response is a `200 image/png` generated against the fixed default benchmark seed

### Requirement: Future dates reject with invalid_input

`GET /api/board` SHALL reject any explicit `date` strictly greater than the current UTC date with `400 { code: "invalid_input", detail: { date: "future" } }`. The board generator MUST NOT be invoked for explicit future dates.

#### Scenario: Future date rejects

- **WHEN** a client issues `GET /api/board?date=` pointing at a date one day after today UTC
- **THEN** the response status is `400` and the body's `code` equals `"invalid_input"`

### Requirement: Malformed dates reject with invalid_input

`GET /api/board` SHALL reject any `date` that does not match the `YYYY-MM-DD` form or does not represent a real calendar date with `400 { code: "invalid_input" }`. The board generator MUST NOT be invoked for malformed dates.

#### Scenario: Non-date string rejects

- **WHEN** a client issues `GET /api/board?date=not-a-date`
- **THEN** the response status is `400` and the body's `code` equals `"invalid_input"`

#### Scenario: Generator not invoked on malformed date

- **WHEN** a client issues `GET /api/board?date=2026-13-40` with a spy installed on the generator
- **THEN** the spy records zero calls

### Requirement: Board responses are Cache-Control public, max-age=86400, immutable

`GET /api/board` and `GET /api/board?date=<past-or-today>` SHALL attach `Cache-Control: public, max-age=86400, immutable` to the `200` response.

#### Scenario: Cache header

- **WHEN** a client issues `GET /api/board?date=2026-04-20`
- **THEN** the response carries `Cache-Control: public, max-age=86400, immutable`

### Requirement: ETag is deterministic per seed date and supports 304

`GET /api/board` SHALL attach an `ETag` whose value is a deterministic hash of the seed date string. A request carrying a matching `If-None-Match` MUST return `304` with an empty body and the same `ETag`.

#### Scenario: ETag stable across repeat calls

- **WHEN** a client issues `GET /api/board?date=2026-04-20` twice
- **THEN** the two responses carry the same `ETag` header value

#### Scenario: If-None-Match match returns 304

- **WHEN** a client issues `GET /api/board?date=2026-04-20` with `If-None-Match` equal to the previously observed `ETag`
- **THEN** the response status is `304`, the body is empty, and the `ETag` header matches the request's `If-None-Match`
