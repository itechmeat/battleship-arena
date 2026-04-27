import type { ProviderError as ProviderErrorShape } from "@battleship-arena/shared";

const PROVIDER_CAUSE_LIMIT = 2048;
const redacted = "[REDACTED]";
const redactedId = "[REDACTED:ID]";
const textEncoder = new TextEncoder();

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
  const firstLines = text.split(/\r?\n/).slice(0, 6).join("\n");
  const sanitized = firstLines
    .replace(/^\d{3}\s+[A-Za-z0-9_-]+:\s*/, "")
    .replace(/https?:\/\/[^\s)"',]+/gi, "[REDACTED:URL]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, redacted)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, redactedId)
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, redactedId)
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      redactedId,
    )
    .replace(/\+?\d[\d\s().-]{8,}\d/g, redactedId)
    .replace(/\b(?:sk|ocg)-[A-Za-z0-9._-]+/gi, redacted)
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, redactedId);

  return truncateUtf8(sanitized, PROVIDER_CAUSE_LIMIT);
}

function truncateUtf8(text: string, limit: number): string {
  if (textEncoder.encode(text).byteLength <= limit) {
    return text;
  }

  const codePoints = Array.from(text);
  let low = 0;
  let high = codePoints.length;
  let best = 0;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = codePoints.slice(0, midpoint).join("");
    if (textEncoder.encode(candidate).byteLength <= limit) {
      best = midpoint;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return codePoints.slice(0, best).join("");
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

    if (this.kind === "rate_limited") {
      return { kind: "rate_limited", cause: this.cause };
    }

    return { kind: "unreachable", cause: this.cause, status: this.status ?? 0 };
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
