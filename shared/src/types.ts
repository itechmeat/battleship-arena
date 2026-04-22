import type { Outcome } from "./outcome.ts";

export interface HealthResponse {
  status: "ok";
  version: string;
  commitSha: string;
  startedAt: number;
}

export interface Shot {
  row: number;
  col: number;
  reasoning?: string;
}

export type CellState = "unknown" | "miss" | "hit" | "sunk";

export interface BoardView {
  size: 10;
  cells: readonly CellState[];
}

export type ShotResult = "hit" | "miss" | "sunk" | "schema_error" | "invalid_coordinate";

export interface RunMeta {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  startedAt: number;
  endedAt: number | null;
  outcome: Outcome | null;
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  invalidCoordinates: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  budgetUsdMicros: number | null;
}

export interface RunShotRow {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: ShotResult;
  rawResponse: string;
  reasoningText: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}

export interface StartRunInput {
  providerId: string;
  modelId: string;
  apiKey: string;
  budgetUsd?: number;
  clientSession: string;
  seedDate: string;
}
