export interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
    reasoning_tokens?: number;
  };
}

export interface ProviderUsage {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
}

export function openAiContentToText(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("");

    return text.length === 0 ? null : text;
  }

  return null;
}

export function extractOpenAiUsage(response: OpenAiChatCompletionResponse): ProviderUsage | null {
  const usage = response.usage;
  if (
    usage === undefined ||
    typeof usage.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number"
  ) {
    return null;
  }

  const rawReasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens;
  const reasoningTokens = typeof rawReasoningTokens === "number" ? rawReasoningTokens : null;

  return {
    tokensIn: usage.prompt_tokens,
    tokensOut: usage.completion_tokens,
    reasoningTokens,
  };
}
