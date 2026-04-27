import type { RunMeta, RunShotRow } from "@battleship-arena/shared";

import {
  replayReducer,
  type ReplayAction,
  type ReplaySpeed,
  type ReplayState,
} from "./replayReducer.ts";

type LoadedReplayState = Extract<ReplayState, { status: "idle" | "playing" | "done" }>;

export function dispatchReplayAction(
  state: () => ReplayState,
  setState: (value: ReplayState) => void,
): (action: ReplayAction) => void {
  return (action: ReplayAction) => {
    setState(replayReducer(state(), action));
  };
}

export function isLoadedReplayState(state: ReplayState): state is LoadedReplayState {
  return state.status === "idle" || state.status === "playing" || state.status === "done";
}

export function replayRun(state: ReplayState): RunMeta | null {
  return isLoadedReplayState(state) ? state.run : null;
}

export function replayShots(state: ReplayState): readonly RunShotRow[] {
  return isLoadedReplayState(state) ? state.shots : [];
}

export function replayErrorMessage(state: ReplayState): string | null {
  return state.status === "error" ? state.message : null;
}

export function nextReplaySpeed(speed: ReplaySpeed): ReplaySpeed {
  switch (speed) {
    case 1:
      return 2;
    case 2:
      return 4;
    case 4:
      return 1;
  }
}

export function replayProgressPercent(idx: number, shotsLength: number): number {
  return shotsLength === 0 ? 0 : Math.round((idx / shotsLength) * 100);
}
