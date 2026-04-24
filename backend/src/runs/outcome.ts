import {
  SCHEMA_ERROR_DNF_THRESHOLD,
  SHOT_CAP,
  TOTAL_SHIP_CELLS,
  type Outcome,
} from "@battleship-arena/shared";

export interface RunLoopState {
  shotsFired: number;
  hits: number;
  consecutiveSchemaErrors: number;
  schemaErrors: number;
  invalidCoordinates: number;
  accumulatedCostMicros: number;
}

export type RunLoopEvent =
  | { kind: "hit"; costUsdMicros?: number }
  | { kind: "miss"; costUsdMicros?: number }
  | { kind: "sunk"; costUsdMicros?: number }
  | { kind: "schema_error"; costUsdMicros?: number }
  | { kind: "invalid_coordinate"; costUsdMicros?: number }
  | { kind: "abort"; reason: "viewer" | "server_restart" };

export interface RunLoopContext {
  budgetMicros: number | null;
}

export function initialRunLoopState(): RunLoopState {
  return {
    shotsFired: 0,
    hits: 0,
    consecutiveSchemaErrors: 0,
    schemaErrors: 0,
    invalidCoordinates: 0,
    accumulatedCostMicros: 0,
  };
}

function costFor(event: RunLoopEvent): number {
  return "costUsdMicros" in event ? (event.costUsdMicros ?? 0) : 0;
}

function resolveOutcome(state: RunLoopState, context: RunLoopContext): Outcome | null {
  if (state.hits >= TOTAL_SHIP_CELLS) {
    return "won";
  }

  if (state.shotsFired >= SHOT_CAP) {
    return "dnf_shot_cap";
  }

  if (state.consecutiveSchemaErrors >= SCHEMA_ERROR_DNF_THRESHOLD) {
    return "dnf_schema_errors";
  }

  if (
    context.budgetMicros !== null &&
    context.budgetMicros > 0 &&
    state.accumulatedCostMicros >= context.budgetMicros
  ) {
    return "dnf_budget";
  }

  return null;
}

export function reduceOutcome(
  state: RunLoopState,
  event: RunLoopEvent,
  context: RunLoopContext = { budgetMicros: null },
): { state: RunLoopState; outcome: Outcome | null } {
  switch (event.kind) {
    case "hit":
    case "sunk": {
      const nextState: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        hits: state.hits + 1,
        consecutiveSchemaErrors: 0,
        accumulatedCostMicros: state.accumulatedCostMicros + costFor(event),
      };

      return { state: nextState, outcome: resolveOutcome(nextState, context) };
    }
    case "miss": {
      const nextState: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        consecutiveSchemaErrors: 0,
        accumulatedCostMicros: state.accumulatedCostMicros + costFor(event),
      };

      return { state: nextState, outcome: resolveOutcome(nextState, context) };
    }
    case "invalid_coordinate": {
      const nextState: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        invalidCoordinates: state.invalidCoordinates + 1,
        consecutiveSchemaErrors: 0,
        accumulatedCostMicros: state.accumulatedCostMicros + costFor(event),
      };

      return { state: nextState, outcome: resolveOutcome(nextState, context) };
    }
    case "schema_error": {
      const nextState: RunLoopState = {
        ...state,
        schemaErrors: state.schemaErrors + 1,
        consecutiveSchemaErrors: state.consecutiveSchemaErrors + 1,
        accumulatedCostMicros: state.accumulatedCostMicros + costFor(event),
      };

      return { state: nextState, outcome: resolveOutcome(nextState, context) };
    }
    case "abort":
      return {
        state,
        outcome: event.reason === "viewer" ? "aborted_viewer" : "aborted_server_restart",
      };
  }
}
