import type { RunMeta, RunShotRow } from "@battleship-arena/shared";

export type ReplaySpeed = 1 | 2 | 4;
type LoadedStatus = "idle" | "playing" | "done";

export type ReplayState =
  | { status: "loading"; idx: number; speed: ReplaySpeed }
  | { status: "error"; idx: number; speed: ReplaySpeed; message: string }
  | {
      status: LoadedStatus;
      idx: number;
      speed: ReplaySpeed;
      run: RunMeta;
      shots: readonly RunShotRow[];
    };

export type ReplayAction =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "tick" }
  | { kind: "seek"; idx: number }
  | { kind: "stepForward" }
  | { kind: "stepBack" }
  | { kind: "speed"; speed: ReplaySpeed }
  | { kind: "loaded"; run: RunMeta; shots: readonly RunShotRow[] }
  | { kind: "loadFailed"; message: string };

function clampIdx(idx: number, shotsLength: number): number {
  return Math.min(Math.max(Math.trunc(idx), 0), shotsLength);
}

function hasShots(state: ReplayState): state is Extract<ReplayState, { status: LoadedStatus }> {
  return state.status === "idle" || state.status === "playing" || state.status === "done";
}

export function replayTickMs(speed: ReplaySpeed): number {
  return Math.round(800 / speed);
}

export function createInitialReplayState(): ReplayState {
  return {
    status: "loading",
    idx: 0,
    speed: 1,
  };
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.kind) {
    case "loaded":
      return {
        status: "idle",
        idx: 0,
        speed: state.speed,
        run: action.run,
        shots: action.shots,
      };
    case "loadFailed":
      return {
        status: "error",
        idx: 0,
        speed: state.speed,
        message: action.message,
      };
    case "play":
      if (!hasShots(state)) {
        return state;
      }

      return {
        ...state,
        status: "playing",
        idx: state.status === "done" ? 0 : state.idx,
      };
    case "pause":
      return hasShots(state) && state.status === "playing" ? { ...state, status: "idle" } : state;
    case "tick": {
      if (!hasShots(state) || state.status !== "playing") {
        return state;
      }

      const idx = clampIdx(state.idx + 1, state.shots.length);

      return {
        ...state,
        idx,
        status: idx >= state.shots.length ? "done" : "playing",
      };
    }
    case "seek":
      return hasShots(state) ? { ...state, idx: clampIdx(action.idx, state.shots.length) } : state;
    case "stepForward":
      if (!hasShots(state) || state.idx >= state.shots.length) {
        return state;
      }

      return { ...state, idx: state.idx + 1 };
    case "stepBack":
      if (!hasShots(state) || state.idx <= 0) {
        return state;
      }

      return { ...state, idx: state.idx - 1 };
    case "speed":
      return { ...state, speed: action.speed };
  }
}
