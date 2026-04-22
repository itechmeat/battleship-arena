import { describe, expect, test } from "bun:test";

import type { SseEvent } from "@battleship-arena/shared";

import { EventRing } from "../../src/runs/event-ring.ts";

function shotEvent(): SseEvent {
  return {
    kind: "shot",
    id: 0,
    idx: 0,
    row: 0,
    col: 0,
    result: "miss",
    reasoning: null,
  };
}

describe("EventRing", () => {
  test("push assigns monotonic ids starting at 1", () => {
    const ring = new EventRing(10);

    ring.push(shotEvent());
    ring.push(shotEvent());

    expect(ring.since(null)).toEqual([
      { ...shotEvent(), id: 1 },
      { ...shotEvent(), id: 2 },
    ]);
  });

  test("overflow drops the oldest events", () => {
    const ring = new EventRing(3);

    for (let index = 0; index < 5; index += 1) {
      ring.push(shotEvent());
    }

    const events = ring.since(null);
    if (events === "out_of_range") {
      throw new Error("since(null) should never return out_of_range");
    }

    expect(events.map((event) => event.id)).toEqual([3, 4, 5]);
  });

  test("since(n) returns only newer events", () => {
    const ring = new EventRing(10);

    for (let index = 0; index < 5; index += 1) {
      ring.push(shotEvent());
    }

    const events = ring.since(2);
    if (events === "out_of_range") {
      throw new Error("since(2) should still be in range");
    }

    expect(events.map((event) => event.id)).toEqual([3, 4, 5]);
  });

  test("returns out_of_range when the requested id predates the ring horizon", () => {
    const ring = new EventRing(3);

    for (let index = 0; index < 5; index += 1) {
      ring.push(shotEvent());
    }

    expect(ring.since(1)).toBe("out_of_range");
  });
});
