import type { Context } from "hono";

import { respondError } from "../errors.ts";

export function respondInvalidInput(context: Context, detail?: Record<string, unknown>) {
  return respondError(context, "invalid_input", 400, "Invalid input", detail);
}

export function respondRunNotFound(context: Context) {
  return respondError(context, "run_not_found", 404, "Run not found");
}

export function runShotsResponse<TShot>(runId: string, shots: TShot[]) {
  return { runId, shots };
}

export function outcomeResponse(outcome: string | null) {
  return { outcome };
}
