import { describe, expect, test } from "bun:test";

import { PRICING_TABLE } from "../../src/pricing/catalog.ts";
import { createOpenCodeGoAdapter } from "../../src/providers/opencode-go.ts";

describe("OpenCode Go adapter", () => {
  test("uses the captured Go endpoint and strips the provider prefix from model ids", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetch = (async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });

      return Response.json({
        choices: [{ message: { content: '{"row":3,"col":4}' } }],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({ fetch, pricing: PRICING_TABLE });

    const output = await adapter.call(
      {
        modelId: "opencode-go/glm-5.1",
        apiKey: "ocg-test",
        boardPng: new Uint8Array([4, 5, 6]),
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [{ row: 0, col: 0, result: "miss" }],
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    expect(requests[0]?.url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(requests[0]?.body.model).toBe("glm-5.1");
    expect(output.rawText).toBe('{"row":3,"col":4}');
    expect(output.costUsdMicros).toBeGreaterThan(0);
  });

  test("does not leak sentinel API keys into output or console logs", async () => {
    const sentinelKey = "sk-sentinel-opencode-secret";
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
          choices: [{ message: { content: '{"row":3,"col":4}' } }],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 100,
          },
        })) as unknown as typeof globalThis.fetch;
      const adapter = createOpenCodeGoAdapter({ fetch, pricing: PRICING_TABLE });
      const output = await adapter.call(
        {
          modelId: "opencode-go/glm-5.1",
          apiKey: sentinelKey,
          boardPng: new Uint8Array([4, 5, 6]),
          shipsRemaining: ["Destroyer"],
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
});
