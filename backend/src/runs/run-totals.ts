import type { Outcome } from "@battleship-arena/shared";

import type { FinalizeRunArgs } from "../db/queries.ts";
import type { ProviderCallOutput } from "../providers/types.ts";

import type { RunLoopState } from "./outcome.ts";
export { RAW_RESPONSE_LIMIT, REASONING_TEXT_LIMIT, truncateText } from "./text-limits.ts";

export interface AggregateTotals {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
}

export interface TerminalErrorFields {
  terminalErrorCode?: string | null;
  terminalErrorStatus?: number | null;
  terminalErrorMessage?: string | null;
}

export function budgetUsdToMicros(budgetUsd: number | undefined): number | null {
  return budgetUsd === undefined ? null : Math.floor(budgetUsd * 1_000_000 + 0.000001);
}

export function createAggregateTotals(): AggregateTotals {
  return {
    tokensIn: 0,
    tokensOut: 0,
    reasoningTokens: null,
  };
}

export function addReasoningTokens(current: number | null, next: number | null): number | null {
  if (current === null && next === null) {
    return null;
  }

  return (current ?? 0) + (next ?? 0);
}

export function addProviderOutputTotals(
  totals: AggregateTotals,
  providerOutput: ProviderCallOutput,
): void {
  totals.tokensIn += providerOutput.tokensIn;
  totals.tokensOut += providerOutput.tokensOut;
  totals.reasoningTokens = addReasoningTokens(
    totals.reasoningTokens,
    providerOutput.reasoningTokens,
  );
}

export function buildFinalizeRunArgs(input: {
  runId: string;
  startedAt: number;
  endedAt: number;
  outcome: Outcome;
  state: RunLoopState;
  totals: AggregateTotals;
  terminalError?: TerminalErrorFields;
}): FinalizeRunArgs {
  return {
    id: input.runId,
    endedAt: input.endedAt,
    outcome: input.outcome,
    shotsFired: input.state.shotsFired,
    hits: input.state.hits,
    schemaErrors: input.state.schemaErrors,
    invalidCoordinates: input.state.invalidCoordinates,
    durationMs: input.endedAt - input.startedAt,
    tokensIn: input.totals.tokensIn,
    tokensOut: input.totals.tokensOut,
    reasoningTokens: input.totals.reasoningTokens,
    costUsdMicros: input.state.accumulatedCostMicros,
    terminalErrorCode: input.terminalError?.terminalErrorCode ?? null,
    terminalErrorStatus: input.terminalError?.terminalErrorStatus ?? null,
    terminalErrorMessage: input.terminalError?.terminalErrorMessage ?? null,
  };
}
