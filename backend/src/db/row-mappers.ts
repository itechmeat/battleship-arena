import {
  isOutcome,
  type Outcome,
  type RunMeta,
  type RunShotRow,
  type ShotResult,
} from "@battleship-arena/shared";

const SHOT_RESULTS: readonly ShotResult[] = [
  "hit",
  "miss",
  "sunk",
  "schema_error",
  "invalid_coordinate",
  "timeout",
];

export interface RunMetaTableRow {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  reasoningEnabled: boolean;
  startedAt: number;
  endedAt: number | null;
  outcome: string | null;
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
  terminalErrorCode: string | null;
  terminalErrorStatus: number | null;
  terminalErrorMessage: string | null;
}

export interface RunShotTableRow {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: string;
  rawResponse: string;
  reasoningText: string | null;
  llmError: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}

export function isShotResult(value: unknown): value is ShotResult {
  return typeof value === "string" && SHOT_RESULTS.includes(value as ShotResult);
}

export function readOutcome(value: string | null): Outcome | null {
  if (value === null) {
    return null;
  }

  if (!isOutcome(value)) {
    throw new Error(`Unexpected outcome value in runs table: ${value}`);
  }

  return value;
}

export function readShotResult(value: string): ShotResult {
  if (!isShotResult(value)) {
    throw new Error(`Unexpected shot result value in run_shots table: ${value}`);
  }

  return value;
}

export function mapRunMetaRow(row: RunMetaTableRow): RunMeta {
  return {
    id: row.id,
    seedDate: row.seedDate,
    providerId: row.providerId,
    modelId: row.modelId,
    displayName: row.displayName,
    reasoningEnabled: row.reasoningEnabled,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    outcome: readOutcome(row.outcome),
    shotsFired: row.shotsFired,
    hits: row.hits,
    schemaErrors: row.schemaErrors,
    invalidCoordinates: row.invalidCoordinates,
    durationMs: row.durationMs,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    reasoningTokens: row.reasoningTokens,
    costUsdMicros: row.costUsdMicros,
    budgetUsdMicros: row.budgetUsdMicros,
    terminalErrorCode: row.terminalErrorCode,
    terminalErrorStatus: row.terminalErrorStatus,
    terminalErrorMessage: row.terminalErrorMessage,
  };
}

export function mapRunShotRow(row: RunShotTableRow): RunShotRow {
  return {
    runId: row.runId,
    idx: row.idx,
    row: row.row,
    col: row.col,
    result: readShotResult(row.result),
    rawResponse: row.rawResponse,
    reasoningText: row.reasoningText,
    llmError: row.llmError,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    reasoningTokens: row.reasoningTokens,
    costUsdMicros: row.costUsdMicros,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}
