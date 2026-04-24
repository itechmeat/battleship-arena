import { describe, expect, test } from "bun:test";

import { PRICING_TABLE } from "../../src/pricing/catalog.ts";
import { ProviderError } from "../../src/providers/errors.ts";
import { createOpenRouterAdapter } from "../../src/providers/openrouter.ts";

describe("OpenRouter adapter", () => {
  test("posts a multimodal chat completion and computes local pricing", async () => {
    const requests: Array<{
      url: string;
      body: Record<string, unknown>;
      authorization: string | null;
    }> = [];
    const fetch = (async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        authorization: new Headers(init?.headers).get("authorization"),
      });

      return Response.json({
        id: "gen-1",
        choices: [{ message: { content: '{"row":1,"col":2,"reasoning":"probe"}' } }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          completion_tokens_details: { reasoning_tokens: 100 },
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createOpenRouterAdapter({ fetch, pricing: PRICING_TABLE });

    const output = await adapter.call(
      {
        modelId: "openai/gpt-5-nano",
        apiKey: "sk-test",
        boardPng: new Uint8Array([1, 2, 3]),
        shipsRemaining: ["Carrier"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requests[0]?.authorization).toBe("Bearer sk-test");
    expect(requests[0]?.body.model).toBe("openai/gpt-5-nano");
    expect(JSON.stringify(requests[0]?.body)).toContain("data:image/png;base64,AQID");
    expect(output.rawText).toBe('{"row":1,"col":2,"reasoning":"probe"}');
    expect(output.tokensIn).toBe(1000);
    expect(output.tokensOut).toBe(500);
    expect(output.reasoningTokens).toBe(100);
    expect(output.costUsdMicros).toBe(250);
  });

  test("returns non-JSON 200 bodies as raw text for schema-error classification", async () => {
    const fetch = (async () =>
      new Response("I choose B7 because it probes the center.", {
        headers: { "Content-Type": "text/plain" },
      })) as unknown as typeof globalThis.fetch;
    const adapter = createOpenRouterAdapter({ fetch, pricing: PRICING_TABLE });

    const output = await adapter.call(
      {
        modelId: "openai/gpt-5-nano",
        apiKey: "sk-test",
        boardPng: new Uint8Array([1, 2, 3]),
        shipsRemaining: ["Carrier"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    expect(output).toMatchObject({
      rawText: "I choose B7 because it probes the center.",
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: null,
      costUsdMicros: 0,
    });
  });

  test("does not leak sentinel API keys into output or console logs", async () => {
    const sentinelKey = "sk-sentinel-openrouter-secret";
    const consoleCalls: string[] = [];
    const originals = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };
    console.log = ((...args: unknown[]) =>
      consoleCalls.push(JSON.stringify(args))) as typeof console.log;
    console.warn = ((...args: unknown[]) =>
      consoleCalls.push(JSON.stringify(args))) as typeof console.warn;
    console.error = ((...args: unknown[]) =>
      consoleCalls.push(JSON.stringify(args))) as typeof console.error;
    console.info = ((...args: unknown[]) =>
      consoleCalls.push(JSON.stringify(args))) as typeof console.info;

    try {
      const fetch = (async () =>
        Response.json({
          choices: [{ message: { content: '{"row":1,"col":2}' } }],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 500,
          },
        })) as unknown as typeof globalThis.fetch;
      const adapter = createOpenRouterAdapter({ fetch, pricing: PRICING_TABLE });
      const output = await adapter.call(
        {
          modelId: "openai/gpt-5-nano",
          apiKey: sentinelKey,
          boardPng: new Uint8Array([1, 2, 3]),
          shipsRemaining: ["Carrier"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-24",
        },
        new AbortController().signal,
      );

      expect(JSON.stringify(output)).not.toContain(sentinelKey);
      expect(consoleCalls.join("\n")).not.toContain(sentinelKey);
    } finally {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
      console.info = originals.info;
    }
  });

  test("translates HTTP auth failures to unreachable ProviderError", async () => {
    const fetch = (async () =>
      new Response("bad key", { status: 401 })) as unknown as typeof globalThis.fetch;
    const adapter = createOpenRouterAdapter({ fetch, pricing: PRICING_TABLE });

    await expect(
      adapter.call(
        {
          modelId: "openai/gpt-5-nano",
          apiKey: "sk-test",
          boardPng: new Uint8Array([1, 2, 3]),
          shipsRemaining: ["Carrier"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-24",
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      kind: "unreachable",
      status: 401,
    });

    await expect(
      adapter.call(
        {
          modelId: "openai/gpt-5-nano",
          apiKey: "sk-test",
          boardPng: new Uint8Array([1, 2, 3]),
          shipsRemaining: ["Carrier"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-24",
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
