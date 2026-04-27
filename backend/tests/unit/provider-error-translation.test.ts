import { describe, expect, test } from "bun:test";

import {
  formatProviderHttpFailureCause,
  translateProviderHttpError,
} from "../../src/providers/provider-error-translation.ts";
import { NonRetriable4xxError, TransientFailureError } from "../../src/providers/http.ts";

describe("provider HTTP error translation", () => {
  test("classifies key-limit 403 bodies as quota", () => {
    const translated = translateProviderHttpError(
      new NonRetriable4xxError(403, '{"error":{"message":"Key limit exceeded (total limit)."}}'),
    );

    expect(translated).toEqual(
      expect.objectContaining({
        kind: "unreachable",
        code: "quota",
        status: 403,
        cause: expect.stringContaining("Key limit exceeded"),
      }),
    );
  });

  test("classifies credit-limit body text as quota", () => {
    const translated = translateProviderHttpError(
      new NonRetriable4xxError(403, "Credit limit reached for this project"),
    );

    expect(translated).toEqual(expect.objectContaining({ code: "quota", status: 403 }));
  });

  test("keeps ordinary 401 responses as auth", () => {
    const translated = translateProviderHttpError(new NonRetriable4xxError(401, "bad key"));

    expect(translated).toEqual(
      expect.objectContaining({
        kind: "unreachable",
        code: "auth",
        status: 401,
      }),
    );
  });

  test("classifies exhausted 429 responses as unreachable rate_limited", () => {
    const translated = translateProviderHttpError(
      new TransientFailureError("Provider rate limit reached", {
        status: 429,
        body: "requests-per-window exceeded",
      }),
    );

    expect(translated).toEqual(
      expect.objectContaining({
        kind: "unreachable",
        code: "rate_limited",
        status: 429,
        cause: expect.stringContaining("requests-per-window exceeded"),
      }),
    );
  });

  test("classifies 5xx transient responses as provider_5xx", () => {
    const translated = translateProviderHttpError(
      new TransientFailureError("Provider service failed", {
        status: 503,
        body: "temporarily unavailable",
      }),
    );

    expect(translated).toEqual(
      expect.objectContaining({
        kind: "transient",
        code: "provider_5xx",
        status: 503,
      }),
    );
  });

  test("classifies malformed provider envelopes as malformed_response", () => {
    const translated = translateProviderHttpError(
      new TransientFailureError("Provider returned malformed JSON", {
        body: "not json",
      }),
    );

    expect(translated).toEqual(
      expect.objectContaining({
        kind: "transient",
        code: "malformed_response",
      }),
    );
  });

  test("classifies transport failures as network", () => {
    const translated = translateProviderHttpError(
      new TransientFailureError("Provider network request failed", {
        cause: new Error("ENOTFOUND openrouter.ai"),
      }),
    );

    expect(translated).toEqual(
      expect.objectContaining({
        kind: "transient",
        code: "network",
        cause: expect.stringContaining("ENOTFOUND"),
      }),
    );
  });

  test("sanitizes formatted failure causes", () => {
    const cause = formatProviderHttpFailureCause({
      message: "Provider rejected the request",
      status: 401,
      body: "Authorization: Bearer sk-secret-token and key ocg-private-token",
    });

    expect(cause).toContain("[REDACTED]");
    expect(cause).not.toContain("sk-secret-token");
    expect(cause).not.toContain("ocg-private-token");
  });
});
