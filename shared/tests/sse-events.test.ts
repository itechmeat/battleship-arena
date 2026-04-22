import { describe, expect, test } from "bun:test";

import { isSseEvent } from "../src/sse-events.ts";

describe("isSseEvent", () => {
  test("accepts well-shaped events", () => {
    expect(
      isSseEvent({
        kind: "open",
        id: 1,
        runId: "run-1",
        startedAt: 1,
        seedDate: "2026-04-21",
      }),
    ).toBe(true);
    expect(
      isSseEvent({
        kind: "shot",
        id: 2,
        idx: 0,
        row: 0,
        col: 0,
        result: "miss",
        reasoning: null,
      }),
    ).toBe(true);
    expect(isSseEvent({ kind: "resync", id: 3 })).toBe(true);
    expect(
      isSseEvent({
        kind: "outcome",
        id: 4,
        outcome: "won",
        shotsFired: 17,
        hits: 17,
        schemaErrors: 0,
        invalidCoordinates: 0,
        endedAt: 2,
      }),
    ).toBe(true);
  });

  test("rejects unknown kinds and missing ids", () => {
    expect(isSseEvent({ kind: "weird", id: 1 })).toBe(false);
    expect(isSseEvent({ kind: "resync" })).toBe(false);
    expect(isSseEvent({ kind: "resync", id: Number.NaN })).toBe(false);
  });

  test("rejects malformed variant payloads", () => {
    expect(
      isSseEvent({
        kind: "shot",
        id: 1,
        idx: 0,
        row: 0,
        col: 0,
        result: "oops",
        reasoning: null,
      }),
    ).toBe(false);

    expect(
      isSseEvent({
        kind: "outcome",
        id: 1,
        outcome: "won",
        shotsFired: 17,
        hits: 17,
        schemaErrors: 0,
        invalidCoordinates: 0,
      }),
    ).toBe(false);
  });
});
