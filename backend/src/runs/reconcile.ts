import type { Queries } from "../db/queries.ts";

export function reconcileStuckRuns(queries: Queries, nowMs: number): number {
  return queries.markStuckRunsAborted("aborted_server_restart", nowMs);
}
