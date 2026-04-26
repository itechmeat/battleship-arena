import { describe, expect, test } from "bun:test";

import { PRICING_TABLE } from "../../src/pricing/catalog.ts";
import { ProviderError } from "../../src/providers/errors.ts";
import { createZaiAdapter } from "../../src/providers/zai.ts";

describe("Z.AI adapter", () => {
  test("uses the Coding Plan chat-completions endpoint with thinking enabled", async () => {
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
        id: "zai-1",
        choices: [{ message: { content: '{"cell":"C3"}' } }],
        usage: {
          prompt_tokens: 400,
          completion_tokens: 80,
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createZaiAdapter({ fetch, pricing: PRICING_TABLE });

    const output = await adapter.call(
      {
        modelId: "zai/glm-5.1",
        apiKey: "zai-test",
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        seedDate: "2026-04-26",
      },
      new AbortController().signal,
    );

    expect(requests[0]?.url).toBe("https://api.z.ai/api/coding/paas/v4/chat/completions");
    expect(requests[0]?.authorization).toBe("Bearer zai-test");
    expect(requests[0]?.body.model).toBe("glm-5.1");
    expect(requests[0]?.body.max_tokens).toBe(4_096);
    expect(requests[0]?.body.thinking).toEqual({
      type: "enabled",
      clear_thinking: true,
    });
    expect(requests[0]?.body).not.toHaveProperty("reasoning");
    expect(requests[0]?.body).not.toHaveProperty("verbosity");
    expect(requests[0]?.body.response_format).toEqual({ type: "json_object" });
    expect(output.rawText).toBe('{"cell":"C3"}');
    expect(output.tokensIn).toBe(400);
    expect(output.tokensOut).toBe(80);
    expect(output.costUsdMicros).toBeGreaterThan(0);
  });

  test("keeps thinking enabled for forced-on models even when input requests disabled reasoning", async () => {
    const requests: Array<{ body: Record<string, unknown> }> = [];
    const fetch = (async (_url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });

      return Response.json({
        choices: [{ message: { content: '{"cell":"C3"}' } }],
        usage: {
          prompt_tokens: 400,
          completion_tokens: 80,
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createZaiAdapter({ fetch, pricing: PRICING_TABLE });

    await adapter.call(
      {
        modelId: "zai/glm-5.1",
        apiKey: "zai-test",
        reasoningEnabled: false,
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        seedDate: "2026-04-26",
      },
      new AbortController().signal,
    );

    expect(requests[0]?.body.thinking).toEqual({
      type: "enabled",
      clear_thinking: true,
    });
    expect(requests[0]?.body.max_tokens).toBe(4_096);
  });

  test("does not leak sentinel API keys into output or console logs", async () => {
    const sentinelKey = "zai-sentinel-secret";
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
          choices: [{ message: { content: '{"cell":"C3"}' } }],
          usage: {
            prompt_tokens: 400,
            completion_tokens: 80,
          },
        })) as unknown as typeof globalThis.fetch;
      const adapter = createZaiAdapter({ fetch, pricing: PRICING_TABLE });
      const output = await adapter.call(
        {
          modelId: "zai/glm-5.1",
          apiKey: sentinelKey,
          boardText: "   ABCDEFGHIJ\n01 ..........",
          shipsRemaining: ["Destroyer"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-26",
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

  test("preserves empty visible content with usage for schema-error telemetry", async () => {
    const fetch = (async () =>
      Response.json({
        id: "zai-empty",
        choices: [
          {
            message: {
              reasoning_content: "thinking about the board",
              content: "",
            },
          },
        ],
        usage: {
          prompt_tokens: 400,
          completion_tokens: 4096,
        },
      })) as unknown as typeof globalThis.fetch;
    const adapter = createZaiAdapter({ fetch, pricing: PRICING_TABLE });

    const output = await adapter.call(
      {
        modelId: "zai/glm-5.1",
        apiKey: "zai-test",
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        seedDate: "2026-04-26",
      },
      new AbortController().signal,
    );

    expect(output.rawText).toBe("");
    expect(output.tokensIn).toBe(400);
    expect(output.tokensOut).toBe(4096);
  });

  test("translates HTTP auth failures to unreachable ProviderError", async () => {
    const fetch = (async () =>
      new Response("bad key", {
        status: 401,
      })) as unknown as typeof globalThis.fetch;
    const adapter = createZaiAdapter({ fetch, pricing: PRICING_TABLE });

    await expect(
      adapter.call(
        {
          modelId: "zai/glm-5.1",
          apiKey: "zai-test",
          boardText: "   ABCDEFGHIJ\n01 ..........",
          shipsRemaining: ["Destroyer"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-26",
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
          modelId: "zai/glm-5.1",
          apiKey: "zai-test",
          boardText: "   ABCDEFGHIJ\n01 ..........",
          shipsRemaining: ["Destroyer"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-26",
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
