import type { ProviderErrorCode } from "./errors.ts";
import { sanitizeProviderCause } from "./errors.ts";
import { NonRetriable4xxError, TransientFailureError } from "./http.ts";

interface HttpFailureCauseInput {
  message: string;
  status?: number;
  body?: string;
  cause?: unknown;
}

export type ProviderHttpErrorTranslation =
  | {
      kind: "unreachable";
      code: ProviderErrorCode;
      message: string;
      status: number;
      cause: string;
    }
  | {
      kind: "transient";
      code: ProviderErrorCode;
      message: string;
      status?: number;
      cause: string;
    };

const QUOTA_CAUSE_PATTERNS = [
  "key limit",
  "key limit exceeded",
  "credit limit",
  "quota",
  "balance",
  "billing",
  "insufficient credit",
  "insufficient credits",
  "payment required",
] as const;

export function formatProviderHttpFailureCause(error: HttpFailureCauseInput): string {
  const body = error.body?.trim();
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
  const details = body?.length ? body : cause;
  const prefix = error.status === undefined ? error.message : `${error.status} upstream`;
  const rawCause = details.length === 0 ? prefix : `${prefix}: ${details}`;

  return sanitizeProviderCause(rawCause) ?? error.message;
}

export function codeForNonRetriableProviderFailure(
  status: number,
  cause: string,
): ProviderErrorCode {
  const normalizedCause = cause.toLowerCase();

  if (status === 402 || QUOTA_CAUSE_PATTERNS.some((pattern) => normalizedCause.includes(pattern))) {
    return "quota";
  }

  if (status === 401 || status === 403) {
    return "auth";
  }

  return "malformed_response";
}

export function codeForTransientProviderFailure(
  status: number | undefined,
  message: string,
): ProviderErrorCode {
  if (status === 408) {
    return "timeout";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status !== undefined && status >= 500) {
    return "provider_5xx";
  }

  return message.includes("malformed JSON") ? "malformed_response" : "network";
}

export function translateProviderHttpError(error: unknown): ProviderHttpErrorTranslation | null {
  if (error instanceof NonRetriable4xxError) {
    const cause = formatProviderHttpFailureCause(error);

    return {
      kind: "unreachable",
      code: codeForNonRetriableProviderFailure(error.status, cause),
      message: error.message,
      status: error.status,
      cause,
    };
  }

  if (error instanceof TransientFailureError) {
    const cause = formatProviderHttpFailureCause(error);

    if (error.status === 429) {
      return {
        kind: "unreachable",
        code: "rate_limited",
        message: error.message,
        status: error.status,
        cause,
      };
    }

    const translated: ProviderHttpErrorTranslation = {
      kind: "transient",
      code: codeForTransientProviderFailure(error.status, error.message),
      message: error.message,
      cause,
    };

    if (error.status !== undefined) {
      return { ...translated, status: error.status };
    }

    return translated;
  }

  return null;
}
