import { describe, expect, test } from "bun:test";

import {
  NonRetriable4xxError,
  requestJson,
  requestText,
  TransientFailureError,
} from "../../src/providers/http.ts";

describe("provider HTTP client", () => {
  test("maps non-retriable auth responses to NonRetriable4xxError", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ error: "bad key" }), {
        status: 401,
      })) as unknown as typeof globalThis.fetch;

    await expect(
      requestJson(
        {
          fetch,
          url: "https://example.test",
          init: {
            method: "POST",
            headers: { Authorization: "Bearer sk-secret" },
          },
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: "NonRetriable4xxError",
      status: 401,
    });
  });

  test("retries retryable 5xx responses before succeeding", async () => {
    let attempts = 0;
    const fetch = (async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("temporary", { status: 503 })
        : Response.json({ ok: true });
    }) as unknown as typeof globalThis.fetch;

    const result = await requestJson<{ ok: true }>(
      {
        fetch,
        url: "https://example.test",
        init: { method: "POST" },
        retryDelayMs: 0,
      },
      new AbortController().signal,
    );

    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  test("treats 408 as a non-retriable 4xx", async () => {
    let attempts = 0;
    const fetch = (async () => {
      attempts += 1;
      return new Response("timeout", { status: 408 });
    }) as unknown as typeof globalThis.fetch;

    await expect(
      requestText(
        {
          fetch,
          url: "https://example.test",
          init: { method: "POST" },
          retryDelayMs: 0,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      name: "NonRetriable4xxError",
      status: 408,
    });
    expect(attempts).toBe(1);
  });

  test("exhausts retryable statuses after three total attempts", async () => {
    let attempts = 0;
    const fetch = (async () => {
      attempts += 1;
      return new Response("temporary", { status: 503 });
    }) as unknown as typeof globalThis.fetch;

    await expect(
      requestText(
        {
          fetch,
          url: "https://example.test",
          init: { method: "POST" },
          retryDelayMs: 0,
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(TransientFailureError);
    expect(attempts).toBe(3);
  });

  test("returns malformed 200 bodies as text for adapter-level parsing", async () => {
    const fetch = (async () =>
      new Response("not-json", { status: 200 })) as unknown as typeof globalThis.fetch;

    await expect(
      requestText(
        {
          fetch,
          url: "https://example.test",
          init: { method: "POST" },
        },
        new AbortController().signal,
      ),
    ).resolves.toBe("not-json");
  });

  test("raises TransientFailureError after retryable statuses are exhausted", async () => {
    const fetch = (async () =>
      new Response("temporary", { status: 503 })) as unknown as typeof globalThis.fetch;

    await expect(
      requestJson(
        {
          fetch,
          url: "https://example.test",
          init: { method: "POST" },
          retries: 0,
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(TransientFailureError);
  });

  test("aborts while waiting between retry attempts", async () => {
    let attempts = 0;
    const controller = new AbortController();
    const fetch = (async () => {
      attempts += 1;
      setTimeout(() => controller.abort(), 0);
      return new Response("temporary", { status: 503 });
    }) as unknown as typeof globalThis.fetch;

    await expect(
      requestJson(
        {
          fetch,
          url: "https://example.test",
          init: { method: "POST" },
          retryDelayMs: 1000,
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(attempts).toBe(1);
  });

  test("exports distinct transport error classes for adapter translation", () => {
    expect(new NonRetriable4xxError(401, "").name).toBe("NonRetriable4xxError");
    expect(new TransientFailureError("temporary").name).toBe("TransientFailureError");
  });
});
