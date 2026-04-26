import {
  calculateCostUsdMicros,
  getPricingEntry,
  listProviderPricing,
  PRICING_TABLE,
  type PricingTable,
} from "../pricing/catalog.ts";

import { createOpenAiCompatibleAdapter } from "./openai-compatible.ts";
import { ProviderError, type ProviderErrorCode } from "./errors.ts";
import { NonRetriable4xxError, requestText, TransientFailureError } from "./http.ts";
import { buildProviderUserText } from "./prompt.ts";
import type { ProviderAdapter, ProviderCallInput, ProviderCallOutput } from "./types.ts";

export interface CreateOpenCodeGoAdapterOptions {
  fetch?: typeof globalThis.fetch;
  pricing?: PricingTable;
}

interface AnthropicMessagesResponse {
  content?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  stop_reason?: unknown;
}

const OPENCODE_GO_PROVIDER_ID = "opencode-go";
const OPENCODE_GO_CHAT_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
const OPENCODE_GO_MESSAGES_ENDPOINT = "https://opencode.ai/zen/go/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const OPENCODE_GO_REASONING_MAX_TOKENS = 4_096;
const OPENCODE_GO_MESSAGES_MAX_TOKENS = 2_048;

function codeForNonRetriableStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 402) {
    return "quota";
  }

  return "malformed_response";
}

function codeForTransientStatus(status: number | undefined, message: string): ProviderErrorCode {
  if (status === 408) {
    return "timeout";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status !== undefined && status >= 500) {
    return "provider_5xx";
  }

  return message.includes("malformed JSON") ? "malformed_response" : "network";
}

function httpFailureCause(error: {
  message: string;
  status?: number;
  body?: string;
  cause?: unknown;
}): string {
  const body = error.body?.trim();
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
  const details = body?.length ? body : cause;
  const prefix = error.status === undefined ? error.message : `${error.status} upstream`;

  return details.length === 0 ? prefix : `${prefix}: ${details}`;
}

function translateHttpError(error: unknown): ProviderError | null {
  if (error instanceof NonRetriable4xxError) {
    return new ProviderError({
      kind: "unreachable",
      code: codeForNonRetriableStatus(error.status),
      providerId: OPENCODE_GO_PROVIDER_ID,
      message: error.message,
      status: error.status,
      cause: httpFailureCause(error),
    });
  }

  if (error instanceof TransientFailureError) {
    return new ProviderError({
      kind: "transient",
      code: codeForTransientStatus(error.status, error.message),
      providerId: OPENCODE_GO_PROVIDER_ID,
      message: error.message,
      cause: httpFailureCause(error),
    });
  }

  return null;
}

function anthropicContentToText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  let hasTextPart = false;
  const text = content
    .map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        hasTextPart = true;
        return part.text;
      }

      return "";
    })
    .join("");

  return hasTextPart ? text : null;
}

function extractAnthropicUsage(response: AnthropicMessagesResponse): {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: null;
} | null {
  const usage = response.usage;
  if (
    usage === undefined ||
    typeof usage.input_tokens !== "number" ||
    typeof usage.output_tokens !== "number"
  ) {
    return null;
  }

  return {
    tokensIn: usage.input_tokens,
    tokensOut: usage.output_tokens,
    reasoningTokens: null,
  };
}

async function callOpenCodeGoMessages(
  input: ProviderCallInput,
  signal: AbortSignal,
  options: { fetch: typeof globalThis.fetch; pricing: PricingTable },
): Promise<ProviderCallOutput> {
  const model = getPricingEntry(OPENCODE_GO_PROVIDER_ID, input.modelId, options.pricing);
  if (model === undefined) {
    throw new ProviderError({
      kind: "unreachable",
      code: "unsupported_model",
      providerId: OPENCODE_GO_PROVIDER_ID,
      message: "Provider model is not supported",
      status: 400,
      cause: input.modelId,
    });
  }

  const startedAt = Date.now();
  let responseText: string;
  try {
    responseText = await requestText(
      {
        fetch: options.fetch,
        url: OPENCODE_GO_MESSAGES_ENDPOINT,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": input.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: model.providerModelId,
            max_tokens: OPENCODE_GO_MESSAGES_MAX_TOKENS,
            temperature: 0,
            system: input.systemPrompt,
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: buildProviderUserText(input) }],
              },
            ],
          }),
        },
      },
      signal,
    );
  } catch (error) {
    const providerError = translateHttpError(error);
    if (providerError !== null) {
      throw providerError;
    }

    throw error;
  }

  let response: AnthropicMessagesResponse;
  try {
    response = JSON.parse(responseText) as AnthropicMessagesResponse;
  } catch {
    throw new ProviderError({
      kind: "transient",
      code: "malformed_response",
      providerId: OPENCODE_GO_PROVIDER_ID,
      message: "Provider response was not valid JSON",
      cause: `durationMs=${Date.now() - startedAt}; body=${responseText}`,
    });
  }

  const rawText = anthropicContentToText(response.content);
  const usage = extractAnthropicUsage(response);

  if (rawText === null || usage === null) {
    throw new ProviderError({
      kind: "transient",
      code: "malformed_response",
      providerId: OPENCODE_GO_PROVIDER_ID,
      message: "Provider response did not include text content and token usage",
      cause: JSON.stringify(response),
    });
  }

  return {
    rawText,
    ...usage,
    costUsdMicros: calculateCostUsdMicros(
      OPENCODE_GO_PROVIDER_ID,
      input.modelId,
      usage,
      options.pricing,
    ),
    durationMs: Date.now() - startedAt,
  };
}

export function createOpenCodeGoAdapter(options: CreateOpenCodeGoAdapterOptions = {}) {
  const fetch = options.fetch ?? globalThis.fetch;
  const pricing = options.pricing ?? PRICING_TABLE;
  const entries = listProviderPricing(OPENCODE_GO_PROVIDER_ID, pricing);
  const modelById = new Map(entries.map((entry) => [entry.modelId, entry]));
  const openAiCompatible = createOpenAiCompatibleAdapter({
    id: OPENCODE_GO_PROVIDER_ID,
    displayName: "OpenCode Go",
    fetch,
    pricing,
    defaultEndpoint: OPENCODE_GO_CHAT_ENDPOINT,
    includeVerbosity: false,
    includeResponseFormat: false,
    reasoningModelMaxTokens: OPENCODE_GO_REASONING_MAX_TOKENS,
    reasoningRequestFields() {
      return {};
    },
    mapRequestModelId(modelId) {
      return modelId.startsWith("opencode-go/") ? modelId.slice("opencode-go/".length) : modelId;
    },
  });

  return {
    id: openAiCompatible.id,
    models: openAiCompatible.models,

    async call(input, signal) {
      if (modelById.get(input.modelId)?.endpoint === OPENCODE_GO_MESSAGES_ENDPOINT) {
        return await callOpenCodeGoMessages(input, signal, { fetch, pricing });
      }

      return await openAiCompatible.call(input, signal);
    },
  } satisfies ProviderAdapter;
}
