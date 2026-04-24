import { describe, expect, test } from "bun:test";

import {
  initialRunLoopState,
  reduceOutcome,
  type RunLoopEvent,
  type RunLoopState,
} from "../../src/runs/outcome.ts";

function apply(events: readonly RunLoopEvent[]): {
  state: RunLoopState;
  outcome: string | null;
} {
  let state = initialRunLoopState();
  let outcome: string | null = null;

  for (const event of events) {
    const next = reduceOutcome(state, event);
    state = next.state;
    outcome = next.outcome;
    if (outcome !== null) {
      break;
    }
  }

  return { state, outcome };
}

describe("reduceOutcome", () => {
  test("17th hit wins", () => {
    expect(apply(Array.from({ length: 17 }, () => ({ kind: "hit" as const }))).outcome).toBe("won");
  });

  test("100 misses reach dnf_shot_cap", () => {
    expect(apply(Array.from({ length: 100 }, () => ({ kind: "miss" as const }))).outcome).toBe(
      "dnf_shot_cap",
    );
  });

  test("5 consecutive schema errors reach dnf_schema_errors", () => {
    expect(
      apply(Array.from({ length: 5 }, () => ({ kind: "schema_error" as const }))).outcome,
    ).toBe("dnf_schema_errors");
  });

  test("hit resets the consecutive schema-error streak", () => {
    const result = apply([
      { kind: "schema_error" },
      { kind: "schema_error" },
      { kind: "schema_error" },
      { kind: "hit" },
      { kind: "schema_error" },
      { kind: "schema_error" },
      { kind: "schema_error" },
      { kind: "schema_error" },
    ]);

    expect(result.outcome).toBe(null);
    expect(result.state.consecutiveSchemaErrors).toBe(4);
  });

  test("invalid_coordinate contributes to shot cap and resets the streak", () => {
    const result = apply([{ kind: "schema_error" }, { kind: "invalid_coordinate" }]);

    expect(result.state.shotsFired).toBe(1);
    expect(result.state.invalidCoordinates).toBe(1);
    expect(result.state.consecutiveSchemaErrors).toBe(0);
  });

  test("100 invalid_coordinates also reach dnf_shot_cap", () => {
    expect(
      apply(
        Array.from({ length: 100 }, () => ({
          kind: "invalid_coordinate" as const,
        })),
      ).outcome,
    ).toBe("dnf_shot_cap");
  });

  test("abort reason discriminates outcome", () => {
    expect(apply([{ kind: "abort", reason: "viewer" }]).outcome).toBe("aborted_viewer");
    expect(apply([{ kind: "abort", reason: "server_restart" }]).outcome).toBe(
      "aborted_server_restart",
    );
  });

  test("tracks accumulated cost and maps over-budget events to dnf_budget", () => {
    const reduced = reduceOutcome(
      initialRunLoopState(),
      {
        kind: "miss",
        costUsdMicros: 101,
      },
      { budgetMicros: 100 },
    );

    expect(reduced.state.accumulatedCostMicros).toBe(101);
    expect(reduced.outcome).toBe("dnf_budget");
  });

  test("budget met exactly triggers dnf_budget", () => {
    const reduced = reduceOutcome(
      initialRunLoopState(),
      {
        kind: "miss",
        costUsdMicros: 40_000,
      },
      { budgetMicros: 40_000 },
    );

    expect(reduced.outcome).toBe("dnf_budget");
  });

  test("null and zero budgets never trigger dnf_budget", () => {
    expect(
      reduceOutcome(
        initialRunLoopState(),
        {
          kind: "miss",
          costUsdMicros: 1_000_000,
        },
        { budgetMicros: null },
      ).outcome,
    ).toBe(null);
    expect(
      reduceOutcome(
        initialRunLoopState(),
        {
          kind: "miss",
          costUsdMicros: 1_000_000,
        },
        { budgetMicros: 0 },
      ).outcome,
    ).toBe(null);
  });

  test("terminal priority prefers win over budget on the same event", () => {
    let state = initialRunLoopState();
    for (let index = 0; index < 16; index += 1) {
      state = reduceOutcome(state, { kind: "hit", costUsdMicros: 0 }, { budgetMicros: 1 }).state;
    }

    const reduced = reduceOutcome(
      state,
      {
        kind: "sunk",
        costUsdMicros: 2,
      },
      { budgetMicros: 1 },
    );

    expect(reduced.outcome).toBe("won");
  });

  test("terminal priority prefers schema-error DNF over budget on the same event", () => {
    let state = initialRunLoopState();
    for (let index = 0; index < 4; index += 1) {
      state = reduceOutcome(
        state,
        { kind: "schema_error", costUsdMicros: 0 },
        { budgetMicros: 1 },
      ).state;
    }

    const reduced = reduceOutcome(
      state,
      {
        kind: "schema_error",
        costUsdMicros: 2,
      },
      { budgetMicros: 1 },
    );

    expect(reduced.outcome).toBe("dnf_schema_errors");
  });
});
