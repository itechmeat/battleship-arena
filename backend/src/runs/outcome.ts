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
}

export type RunLoopEvent =
  | { kind: "hit" }
  | { kind: "miss" }
  | { kind: "sunk" }
  | { kind: "schema_error" }
  | { kind: "invalid_coordinate" }
  | { kind: "abort"; reason: "viewer" | "server_restart" };

export function initialRunLoopState(): RunLoopState {
  return {
    shotsFired: 0,
    hits: 0,
    consecutiveSchemaErrors: 0,
    schemaErrors: 0,
    invalidCoordinates: 0,
  };
}

export function reduceOutcome(
  state: RunLoopState,
  event: RunLoopEvent,
): { state: RunLoopState; outcome: Outcome | null } {
  switch (event.kind) {
    case "hit":
    case "sunk": {
      const nextState: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        hits: state.hits + 1,
        consecutiveSchemaErrors: 0,
      };

      if (nextState.hits >= TOTAL_SHIP_CELLS) {
        return { state: nextState, outcome: "won" };
      }

      if (nextState.shotsFired >= SHOT_CAP) {
        return { state: nextState, outcome: "dnf_shot_cap" };
      }

      return { state: nextState, outcome: null };
    }
    case "miss": {
      const nextState: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        consecutiveSchemaErrors: 0,
      };

      if (nextState.shotsFired >= SHOT_CAP) {
        return { state: nextState, outcome: "dnf_shot_cap" };
      }

      return { state: nextState, outcome: null };
    }
    case "invalid_coordinate": {
      const nextState: RunLoopState = {
        ...state,
        shotsFired: state.shotsFired + 1,
        invalidCoordinates: state.invalidCoordinates + 1,
        consecutiveSchemaErrors: 0,
      };

      if (nextState.shotsFired >= SHOT_CAP) {
        return { state: nextState, outcome: "dnf_shot_cap" };
      }

      return { state: nextState, outcome: null };
    }
    case "schema_error": {
      const nextState: RunLoopState = {
        ...state,
        schemaErrors: state.schemaErrors + 1,
        consecutiveSchemaErrors: state.consecutiveSchemaErrors + 1,
      };

      if (nextState.consecutiveSchemaErrors >= SCHEMA_ERROR_DNF_THRESHOLD) {
        return { state: nextState, outcome: "dnf_schema_errors" };
      }

      return { state: nextState, outcome: null };
    }
    case "abort":
      return {
        state,
        outcome: event.reason === "viewer" ? "aborted_viewer" : "aborted_server_restart",
      };
  }
}
