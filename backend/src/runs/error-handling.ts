import { isProviderError, ProviderError, sanitizeProviderCause } from "../providers/errors.ts";

import { REASONING_TEXT_LIMIT, truncateText } from "./text-limits.ts";

export interface TerminalProviderError {
  terminalErrorCode: string;
  terminalErrorStatus: number | null;
  terminalErrorMessage: string;
}

export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isNonRetriable4xx(error: unknown): boolean {
  if (!isObjectRecord(error) || typeof error.status !== "number") {
    return false;
  }

  return error.status >= 400 && error.status < 500 && error.status !== 429;
}

export function readAbortReason(signal: AbortSignal): "viewer" | "server_restart" {
  const reason = signal.reason;
  if (isObjectRecord(reason) && reason.reason === "server_restart") {
    return "server_restart";
  }

  return "viewer";
}

export function serializeProviderError(error: { cause: string }): string {
  return truncateText(sanitizeProviderCause(error.cause) ?? error.cause, REASONING_TEXT_LIMIT);
}

export function isProviderRateLimit(error: ProviderError): boolean {
  return error.kind === "rate_limited" || error.code === "rate_limited" || error.status === 429;
}

export function terminalErrorFromProvider(error: ProviderError): TerminalProviderError {
  return {
    terminalErrorCode: error.code,
    terminalErrorStatus: error.status ?? null,
    terminalErrorMessage: serializeProviderError(error),
  };
}

export { isProviderError };
