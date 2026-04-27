import { describe, expect, test } from "bun:test";

import { ProviderError } from "../../src/providers/errors.ts";
import {
  isAbortError,
  isNonRetriable4xx,
  isProviderRateLimit,
  readAbortReason,
  serializeProviderError,
  terminalErrorFromProvider,
} from "../../src/runs/error-handling.ts";
import { REASONING_TEXT_LIMIT } from "../../src/runs/run-totals.ts";

describe("run error handling", () => {
  test("identifies abort errors and reads abort reasons", () => {
    const viewerAbort = new AbortController();
    viewerAbort.abort();
    expect(isAbortError(viewerAbort.signal.reason)).toBe(true);
    expect(readAbortReason(viewerAbort.signal)).toBe("viewer");

    const restartAbort = new AbortController();
    restartAbort.abort({ reason: "server_restart" });
    expect(readAbortReason(restartAbort.signal)).toBe("server_restart");
  });

  test("detects non-retriable 4xx errors except rate limits", () => {
    expect(isNonRetriable4xx({ status: 401 })).toBe(true);
    expect(isNonRetriable4xx({ status: 429 })).toBe(false);
    expect(isNonRetriable4xx({ status: 503 })).toBe(false);
  });

  test("maps provider rate limits and terminal diagnostics", () => {
    const error = new ProviderError({
      kind: "unreachable",
      code: "rate_limited",
      providerId: "openrouter",
      message: "Provider rate limit reached",
      status: 429,
      cause: "too many requests",
    });

    expect(isProviderRateLimit(error)).toBe(true);
    expect(terminalErrorFromProvider(error)).toEqual({
      terminalErrorCode: "rate_limited",
      terminalErrorStatus: 429,
      terminalErrorMessage: "too many requests",
    });
  });

  test("truncates serialized provider errors", () => {
    const serialized = serializeProviderError({
      cause: "x ".repeat(REASONING_TEXT_LIMIT + 10),
    });

    expect(serialized).toHaveLength(REASONING_TEXT_LIMIT);
  });

  test("sanitizes serialized provider errors", () => {
    const serialized = serializeProviderError({
      cause: "403 upstream: Key limit exceeded for test@example.com with token ocg-secret-token",
    });

    expect(serialized).toContain("Key limit exceeded");
    expect(serialized).not.toContain("403 upstream:");
    expect(serialized).not.toContain("test@example.com");
    expect(serialized).not.toContain("ocg-secret-token");
  });
});
