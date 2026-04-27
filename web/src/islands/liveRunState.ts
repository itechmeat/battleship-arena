import type { Outcome, RunMeta, RunShotRow, SseEvent } from "@battleship-arena/shared";

export type LiveGamePhase = "loading" | "live" | "terminal" | "error" | "notFound";

type SseShotEvent = Extract<SseEvent, { kind: "shot" }>;
type SseOutcomeEvent = Extract<SseEvent, { kind: "outcome" }>;

export function appendShot(previous: readonly RunShotRow[], nextShot: RunShotRow): RunShotRow[] {
  if (previous.some((shot) => shot.idx === nextShot.idx)) {
    return previous as RunShotRow[];
  }

  return [...previous, nextShot].sort((left, right) => left.idx - right.idx);
}

export function shotFromSseEvent(runId: string, event: SseShotEvent): RunShotRow {
  return {
    runId,
    idx: event.idx,
    row: event.row,
    col: event.col,
    result: event.result,
    rawResponse: "",
    reasoningText: event.reasoning,
    llmError: null,
    tokensIn: event.tokensIn ?? 0,
    tokensOut: event.tokensOut ?? 0,
    reasoningTokens: event.reasoningTokens ?? null,
    costUsdMicros: event.costUsdMicros ?? 0,
    durationMs: event.durationMs ?? 0,
    createdAt: event.createdAt ?? Date.now(),
  };
}

export function mergeOutcome(meta: RunMeta, outcome: SseOutcomeEvent): RunMeta {
  return {
    ...meta,
    outcome: outcome.outcome,
    endedAt: outcome.endedAt,
    shotsFired: outcome.shotsFired,
    hits: outcome.hits,
    schemaErrors: outcome.schemaErrors,
    invalidCoordinates: outcome.invalidCoordinates,
  };
}

export function pageStateLabel(phase: LiveGamePhase): string {
  switch (phase) {
    case "live":
      return "In progress";
    case "terminal":
      return "Finished";
    case "error":
      return "Interrupted";
    case "notFound":
      return "Run not found";
    case "loading":
      return "Loading";
  }
}

export function terminalErrorSummary(meta: RunMeta | null): string | null {
  if (meta?.terminalErrorMessage == null) {
    return null;
  }

  const status = meta.terminalErrorStatus != null ? `HTTP ${meta.terminalErrorStatus} ` : "";
  const code = meta.terminalErrorCode ?? "provider_error";

  return `${status}${code}: ${meta.terminalErrorMessage}`;
}

export function isTerminalOutcome(outcome: Outcome | null): boolean {
  return outcome !== null;
}
