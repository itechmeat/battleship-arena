import { describe, expect, test } from "bun:test";

import { ProviderError, sanitizeProviderCause } from "../../src/providers/errors.ts";

describe("ProviderError", () => {
  test("carries provider-safe metadata without leaking bearer tokens", () => {
    const error = new ProviderError({
      kind: "unreachable",
      code: "auth",
      providerId: "openrouter",
      message: "Provider authentication failed",
      status: 401,
      cause: "Authorization: Bearer sk-secret-token",
    });

    expect(error.kind).toBe("unreachable");
    expect(error.code).toBe("auth");
    expect(error.providerId).toBe("openrouter");
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(401);
    expect(error.toJSON()).toEqual({
      kind: "unreachable",
      cause: "Authorization: [REDACTED]",
      status: 401,
    });
    expect(JSON.stringify(error.toJSON())).not.toContain("sk-secret-token");
  });

  test("strips provider prefixes while preserving useful diagnostics", () => {
    const sanitized = sanitizeProviderCause(
      "403 upstream: Key limit exceeded for user test@example.com using token sk-secret-token",
    );

    expect(sanitized).toContain("Key limit exceeded");
    expect(sanitized).not.toContain("403 upstream:");
    expect(sanitized).not.toContain("test@example.com");
    expect(sanitized).not.toContain("sk-secret-token");
  });

  test("truncates sanitized causes to 2 KiB", () => {
    const sanitized = sanitizeProviderCause("x ".repeat(3000));

    expect(sanitized).toBeDefined();
    expect(sanitized?.length).toBe(2048);
  });
});
