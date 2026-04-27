import { describe, expect, test } from "bun:test";

import { PRICING_TABLE, type PricingTable } from "../../src/pricing/catalog.ts";
import { ProviderError } from "../../src/providers/errors.ts";
import { createOpenCodeGoAdapter } from "../../src/providers/opencode-go.ts";

const OPENCODE_GO_MESSAGES_ENDPOINT = "https://opencode.ai/zen/go/v1/messages";

function pricingWithDeepSeekMessagesEndpoint(): PricingTable {
  const flashEntry = PRICING_TABLE["opencode-go"]?.["opencode-go/deepseek-v4-flash"];
  if (flashEntry === undefined) {
    throw new Error("Missing DeepSeek V4 Flash pricing entry");
  }

  return {
    ...PRICING_TABLE,
    "opencode-go": {
      ...PRICING_TABLE["opencode-go"],
      "opencode-go/deepseek-v4-flash": {
        ...flashEntry,
        endpoint: OPENCODE_GO_MESSAGES_ENDPOINT,
      },
    },
  };
}

describe("OpenCode Go adapter", () => {
  test("uses the captured Go endpoint and strips the provider prefix from model ids", async () => {
    const requests: Array<{
      url: string;
      body: Record<string, unknown>;
      apiKey: string | null;
      authorization: string | null;
    }> = [];
    const fetch = (async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        apiKey: headers.get("x-api-key"),
        authorization: headers.get("authorization"),
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
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [{ row: 0, col: 0, result: "miss" }],
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    expect(requests[0]?.url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(requests[0]?.apiKey).toBeNull();
    expect(requests[0]?.authorization).toBe("Bearer ocg-test");
    expect(requests[0]?.body.model).toBe("glm-5.1");
    expect(requests[0]?.body.max_tokens).toBe(4_096);
    expect(requests[0]?.body).not.toHaveProperty("reasoning");
    expect(requests[0]?.body).not.toHaveProperty("verbosity");
    expect(requests[0]?.body).not.toHaveProperty("response_format");
    expect(JSON.stringify(requests[0]?.body)).toContain("No separate shot history is provided");
    expect(JSON.stringify(requests[0]?.body)).toContain(
      "Rule-filtered candidate cells for this turn",
    );
    expect(JSON.stringify(requests[0]?.body)).toContain("Pick one listed legal candidate cell now");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("Recommended legal shot");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("Return exactly");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("Your last");
    expect(output.rawText).toBe('{"row":3,"col":4}');
    expect(output.costUsdMicros).toBeGreaterThan(0);
  });

  test("uses the documented Anthropic-style messages endpoint for DeepSeek V4 Flash", async () => {
    const requests: Array<{
      url: string;
      body: Record<string, unknown>;
      apiKey: string | null;
      anthropicVersion: string | null;
      authorization: string | null;
    }> = [];
    const fetch = (async (url, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        apiKey: headers.get("x-api-key"),
        anthropicVersion: headers.get("anthropic-version"),
        authorization: headers.get("authorization"),
      });

      return Response.json({
        id: "msg-1",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: '{"cell":"F5"}' }],
        model: "deepseek-v4-flash",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 300,
          output_tokens: 40,
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({
      fetch,
      pricing: pricingWithDeepSeekMessagesEndpoint(),
    });

    const output = await adapter.call(
      {
        modelId: "opencode-go/deepseek-v4-flash",
        apiKey: "ocg-test",
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        consecutiveSchemaErrors: 1,
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    expect(requests[0]?.url).toBe("https://opencode.ai/zen/go/v1/messages");
    expect(requests[0]?.apiKey).toBe("ocg-test");
    expect(requests[0]?.authorization).toBeNull();
    expect(requests[0]?.anthropicVersion).toBe("2023-06-01");
    expect(requests[0]?.body.model).toBe("deepseek-v4-flash");
    expect(requests[0]?.body.max_tokens).toBe(2_048);
    expect(requests[0]?.body).not.toHaveProperty("reasoning");
    expect(requests[0]?.body).not.toHaveProperty("response_format");
    expect(JSON.stringify(requests[0]?.body)).toContain("Final answer format");
    expect(JSON.stringify(requests[0]?.body)).toContain(
      "Choose exactly one cell from the candidate list yourself",
    );
    expect(JSON.stringify(requests[0]?.body)).toContain("short unordered hunt list");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("No separate shot history is provided");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("Emergency fallback final answer");
    expect(JSON.stringify(requests[0]?.body)).toContain("Do not use row/col keys");
    expect(output.rawText).toBe('{"cell":"F5"}');
    expect(output.tokensIn).toBe(300);
    expect(output.tokensOut).toBe(40);
    expect(output.reasoningTokens).toBeNull();
    expect(output.costUsdMicros).toBeGreaterThan(0);
  });

  test("adds a post-sink exploration reminder with rule-filtered candidates", async () => {
    const requests: Array<{ body: Record<string, unknown> }> = [];
    const fetch = (async (_url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });

      return Response.json({
        choices: [{ message: { content: '{"cell":"D7"}' } }],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({ fetch, pricing: PRICING_TABLE });

    await adapter.call(
      {
        modelId: "opencode-go/glm-5.1",
        apiKey: "ocg-test",
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [{ row: 8, col: 2, result: "sunk" }],
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    const requestText = JSON.stringify(requests[0]?.body);
    expect(requestText).toContain("The last legal shot sank a ship");
    expect(requestText).toContain("Resume exploration among unknown '.' cells");
    expect(requestText).toContain("Rule-filtered candidate cells for this turn");
    expect(requestText).not.toContain("Recommended legal shot");
  });

  test("keeps hunt recovery compact and model-chosen", async () => {
    const requests: Array<{ body: Record<string, unknown> }> = [];
    const fetch = (async (_url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });

      return Response.json({
        choices: [{ message: { content: '{"cell":"B1"}' } }],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
        },
      });
    }) as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({ fetch, pricing: PRICING_TABLE });

    await adapter.call(
      {
        modelId: "opencode-go/glm-5.1",
        apiKey: "ocg-test",
        boardText: "   ABCDEFGHIJ\n01 o.........\n02 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [{ row: 0, col: 0, result: "miss" }],
        consecutiveSchemaErrors: 1,
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    const messages = requests[0]?.body.messages;
    if (!Array.isArray(messages)) {
      throw new Error("Missing request messages");
    }

    const userMessage = messages.find(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "role" in message &&
        message.role === "user",
    );
    if (
      typeof userMessage !== "object" ||
      userMessage === null ||
      !("content" in userMessage) ||
      typeof userMessage.content !== "string"
    ) {
      throw new Error("Missing user message content");
    }

    const userMessageContent = userMessage.content;
    const candidateLine = userMessageContent
      .split("\n")
      .find((line: string) => line.startsWith("Rule-filtered candidate cells for this turn"));
    expect(userMessageContent).toContain(
      "Choose exactly one cell from the candidate list yourself",
    );
    expect(userMessageContent).toContain("short unordered hunt list");
    expect(userMessageContent).not.toContain("Emergency fallback final answer");
    expect(candidateLine).toBeDefined();
    expect(userMessageContent).not.toContain("Current board:");
    expect(userMessageContent).not.toContain(
      "Cells marked o, X, or S are already used and unavailable",
    );
    expect(userMessageContent).toContain("Rule-filtered candidate cells for this turn");
  });

  test("preserves empty messages responses with usage for schema-error telemetry", async () => {
    const fetch = (async () =>
      Response.json({
        id: "msg-empty",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "" }],
        model: "deepseek-v4-flash",
        stop_reason: "max_tokens",
        usage: {
          input_tokens: 176,
          output_tokens: 2048,
        },
      })) as unknown as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({
      fetch,
      pricing: pricingWithDeepSeekMessagesEndpoint(),
    });

    const output = await adapter.call(
      {
        modelId: "opencode-go/deepseek-v4-flash",
        apiKey: "ocg-test",
        boardText: "   ABCDEFGHIJ\n01 ..........",
        shipsRemaining: ["Destroyer"],
        systemPrompt: "Return JSON.",
        priorShots: [],
        seedDate: "2026-04-24",
      },
      new AbortController().signal,
    );

    expect(output.rawText).toBe("");
    expect(output.tokensIn).toBe(176);
    expect(output.tokensOut).toBe(2048);
    expect(output.reasoningTokens).toBeNull();
  });

  test("throws ProviderError when messages endpoint returns malformed JSON", async () => {
    const fetch = (async () =>
      new Response("I choose B7 because it probes the center.", {
        headers: { "Content-Type": "text/plain" },
      })) as unknown as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({
      fetch,
      pricing: pricingWithDeepSeekMessagesEndpoint(),
    });

    await expect(
      adapter.call(
        {
          modelId: "opencode-go/deepseek-v4-flash",
          apiKey: "ocg-test",
          boardText: "   ABCDEFGHIJ\n01 ..........",
          shipsRemaining: ["Destroyer"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-24",
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      kind: "transient",
      code: "malformed_response",
      providerId: "opencode-go",
      message: "Provider response was not valid JSON",
      cause: expect.stringContaining("I choose B7"),
    });

    await expect(
      adapter.call(
        {
          modelId: "opencode-go/deepseek-v4-flash",
          apiKey: "ocg-test",
          boardText: "   ABCDEFGHIJ\n01 ..........",
          shipsRemaining: ["Destroyer"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-24",
        },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("translates exhausted messages-endpoint 429 responses to rate-limited ProviderError", async () => {
    let attempts = 0;
    const fetch = (async () => {
      attempts += 1;
      return new Response("requests-per-window exceeded", {
        status: 429,
        headers: { "Retry-After": "0" },
      });
    }) as unknown as typeof globalThis.fetch;
    const adapter = createOpenCodeGoAdapter({
      fetch,
      pricing: pricingWithDeepSeekMessagesEndpoint(),
    });

    await expect(
      adapter.call(
        {
          modelId: "opencode-go/deepseek-v4-flash",
          apiKey: "ocg-test",
          boardText: "   ABCDEFGHIJ\n01 ..........",
          shipsRemaining: ["Destroyer"],
          systemPrompt: "Return JSON.",
          priorShots: [],
          seedDate: "2026-04-24",
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      kind: "unreachable",
      code: "rate_limited",
      status: 429,
      cause: expect.stringContaining("requests-per-window exceeded"),
    });
    expect(attempts).toBe(3);
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
      const adapter = createOpenCodeGoAdapter({
        fetch,
        pricing: PRICING_TABLE,
      });
      const output = await adapter.call(
        {
          modelId: "opencode-go/glm-5.1",
          apiKey: sentinelKey,
          boardText: "   ABCDEFGHIJ\n01 ..........",
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
