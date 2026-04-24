import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  ApiError,
  getLeaderboard,
  getProviders,
  getRun,
  getRunShots,
  request,
  startRun,
} from "../../src/lib/api.ts";

const originalFetch = globalThis.fetch;

describe("api client", () => {
  beforeEach(() => {
    globalThis.fetch = mock(async (_input, init) => {
      return new Response(JSON.stringify({ ok: true, credentials: init?.credentials ?? null }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("request uses same-origin credentials", async () => {
    const response = await request<{
      ok: boolean;
      credentials: RequestCredentials;
    }>("/api/ping");

    expect(response).toEqual({ ok: true, credentials: "same-origin" });
  });

  test("startRun sends JSON and propagates ApiError envelopes", async () => {
    globalThis.fetch = mock(async (_input, init) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: {
              code: "invalid_input",
              message: "Bad payload",
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 400,
          },
        );
      }

      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    return expect(
      startRun({
        providerId: "mock",
        modelId: "mock-happy",
        apiKey: "test-key",
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  test("getRun and getRunShots forward AbortSignal", async () => {
    const calls: RequestInit[] = [];

    globalThis.fetch = mock(async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({}), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();

    await getRun("run-1", controller.signal);
    await getRunShots("run-1", controller.signal);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.signal).toBe(controller.signal);
    expect(calls[1]?.signal).toBe(controller.signal);
  });

  test("getProviders and getLeaderboard call the new API routes with filters and signal", async () => {
    const calls: Array<{ path: string; signal: AbortSignal | null | undefined }> = [];
    globalThis.fetch = mock(async (input, init) => {
      calls.push({ path: String(input), signal: init?.signal });
      return new Response(JSON.stringify({ providers: [], rows: [] }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      });
    }) as unknown as typeof fetch;
    const controller = new AbortController();

    await getProviders();
    await getLeaderboard("all", {
      providerId: "openrouter",
      modelId: "openai/gpt-5-nano",
      signal: controller.signal,
    });

    expect(calls).toEqual([
      { path: "/api/providers", signal: undefined },
      {
        path: "/api/leaderboard?scope=all&providerId=openrouter&modelId=openai%2Fgpt-5-nano",
        signal: controller.signal,
      },
    ]);
  });
});
