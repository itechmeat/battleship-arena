import { describe, expect, test } from "bun:test";

import { extractOpenAiUsage, openAiContentToText } from "../../src/providers/openai-response.ts";

describe("OpenAI-compatible response helpers", () => {
  test("extracts text from string and multipart content", () => {
    expect(openAiContentToText("plain text")).toBe("plain text");
    expect(
      openAiContentToText([
        { type: "text", text: "A" },
        "B",
        { type: "ignored", value: "C" },
        { text: "D" },
      ]),
    ).toBe("ABD");
  });

  test("returns null when content has no text", () => {
    expect(openAiContentToText([{ type: "image_url" }])).toBeNull();
    expect(openAiContentToText(undefined)).toBeNull();
  });

  test("extracts required usage and optional reasoning tokens", () => {
    expect(
      extractOpenAiUsage({
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          completion_tokens_details: { reasoning_tokens: 2 },
        },
      }),
    ).toEqual({ tokensIn: 10, tokensOut: 4, reasoningTokens: 2 });
  });

  test("falls back to top-level reasoning tokens and rejects incomplete usage", () => {
    expect(
      extractOpenAiUsage({
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
          reasoning_tokens: 1,
        },
      }),
    ).toEqual({ tokensIn: 3, tokensOut: 2, reasoningTokens: 1 });

    expect(extractOpenAiUsage({ usage: { prompt_tokens: 3 } })).toBeNull();
  });
});
