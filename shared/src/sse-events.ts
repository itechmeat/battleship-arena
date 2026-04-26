import { isOutcome, type Outcome } from "./outcome.ts";
import type { ShotResult } from "./types.ts";

const SHOT_RESULTS: readonly ShotResult[] = [
  "hit",
  "miss",
  "sunk",
  "schema_error",
  "invalid_coordinate",
  "timeout",
];

export interface SseOpenEvent {
  kind: "open";
  id: number;
  runId: string;
  startedAt: number;
  seedDate: string;
}

export interface SseShotEvent {
  kind: "shot";
  id: number;
  idx: number;
  row: number | null;
  col: number | null;
  result: ShotResult;
  reasoning: string | null;
  tokensIn?: number;
  tokensOut?: number;
  reasoningTokens?: number | null;
  costUsdMicros?: number;
  durationMs?: number;
  createdAt?: number;
}

export interface SseResyncEvent {
  kind: "resync";
  id: number;
}

export interface SseOutcomeEvent {
  kind: "outcome";
  id: number;
  outcome: Outcome;
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  invalidCoordinates: number;
  endedAt: number;
}

export type SseEvent = SseOpenEvent | SseShotEvent | SseResyncEvent | SseOutcomeEvent;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function hasNumericId(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { id: number } {
  return typeof value.id === "number" && Number.isFinite(value.id);
}

function isShotResult(value: unknown): value is ShotResult {
  return typeof value === "string" && SHOT_RESULTS.includes(value as ShotResult);
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalNullableNumber(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

export function isSseEvent(value: unknown): value is SseEvent {
  if (!isObject(value) || typeof value.kind !== "string" || !hasNumericId(value)) {
    return false;
  }

  switch (value.kind) {
    case "open":
      return (
        typeof value.runId === "string" &&
        typeof value.startedAt === "number" &&
        typeof value.seedDate === "string"
      );
    case "shot":
      return (
        typeof value.idx === "number" &&
        isNullableNumber(value.row) &&
        isNullableNumber(value.col) &&
        isShotResult(value.result) &&
        (value.reasoning === null || typeof value.reasoning === "string") &&
        isOptionalNumber(value.tokensIn) &&
        isOptionalNumber(value.tokensOut) &&
        isOptionalNullableNumber(value.reasoningTokens) &&
        isOptionalNumber(value.costUsdMicros) &&
        isOptionalNumber(value.durationMs) &&
        isOptionalNumber(value.createdAt)
      );
    case "resync":
      return true;
    case "outcome":
      return (
        isOutcome(value.outcome) &&
        typeof value.shotsFired === "number" &&
        typeof value.hits === "number" &&
        typeof value.schemaErrors === "number" &&
        typeof value.invalidCoordinates === "number" &&
        typeof value.endedAt === "number"
      );
    default:
      return false;
  }
}
