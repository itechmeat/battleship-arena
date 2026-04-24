import type { ProviderError as ProviderErrorShape } from "@battleship-arena/shared";

const PROVIDER_CAUSE_LIMIT = 2048;

export type ProviderErrorCode =
  | "auth"
  | "rate_limited"
  | "quota"
  | "timeout"
  | "network"
  | "provider_5xx"
  | "malformed_response"
  | "unsupported_model";

export interface ProviderErrorInput {
  kind: ProviderErrorShape["kind"];
  code: ProviderErrorCode;
  providerId: string;
  message: string;
  status?: number;
  cause?: unknown;
}

export function sanitizeProviderCause(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) {
    return undefined;
  }

  const text = cause instanceof Error ? cause.message : String(cause);
  const withoutBearer = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  const withoutSecretLike = withoutBearer.replace(/\b(?:sk|ocg)-[A-Za-z0-9._-]+/gi, "[redacted]");

  return withoutSecretLike.slice(0, PROVIDER_CAUSE_LIMIT);
}

export class ProviderError extends Error {
  readonly kind: ProviderErrorShape["kind"];
  readonly code: ProviderErrorCode;
  readonly providerId: string;
  readonly retryable: boolean;
  readonly status?: number;
  override readonly cause: string;

  constructor(input: ProviderErrorInput) {
    super(input.message);
    this.name = "ProviderError";
    this.kind = input.kind;
    this.code = input.code;
    this.providerId = input.providerId;
    this.retryable = input.kind === "transient";
    if (input.status !== undefined) {
      this.status = input.status;
    }

    const cause = sanitizeProviderCause(input.cause);
    this.cause = cause ?? input.message;

    if (input.kind === "unreachable" && input.status === undefined) {
      throw new Error("Unreachable ProviderError requires an HTTP status");
    }
  }

  toJSON(): ProviderErrorShape {
    if (this.kind === "transient") {
      return { kind: "transient", cause: this.cause };
    }

    return { kind: "unreachable", cause: this.cause, status: this.status ?? 0 };
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
