import type { RunShotRow } from "@battleship-arena/shared";

export interface LiveGameMetrics {
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  timeoutErrors: number;
  invalidCoordinates: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  costUsdMicros: number;
}

export function deriveMetrics(shots: readonly RunShotRow[]): LiveGameMetrics {
  return {
    shotsFired: shots.length,
    hits: shots.filter((shot) => shot.result === "hit" || shot.result === "sunk").length,
    schemaErrors: shots.filter((shot) => shot.result === "schema_error").length,
    timeoutErrors: shots.filter((shot) => shot.result === "timeout").length,
    invalidCoordinates: shots.filter((shot) => shot.result === "invalid_coordinate").length,
    tokensIn: shots.reduce((total, shot) => total + shot.tokensIn, 0),
    tokensOut: shots.reduce((total, shot) => total + shot.tokensOut, 0),
    reasoningTokens: shots.reduce((total, shot) => total + (shot.reasoningTokens ?? 0), 0),
    costUsdMicros: shots.reduce((total, shot) => total + shot.costUsdMicros, 0),
  };
}

export function formatDurationMs(durationMs: number): string {
  const boundedMs = Math.max(0, durationMs);
  const totalSeconds = Math.floor(boundedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
