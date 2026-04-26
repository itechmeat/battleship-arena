import {
  calculateCostUsdMicros,
  type PricingEntry,
  listProviderPricing,
  reasoningModeForEntry,
  type PricingTable,
} from "../pricing/catalog.ts";

import { ProviderError, type ProviderErrorCode } from "./errors.ts";
import { NonRetriable4xxError, requestText, TransientFailureError } from "./http.ts";
import type { ProviderAdapter, ProviderCallOutput, ProviderModel } from "./types.ts";
import { buildProviderUserText } from "./prompt.ts";

interface CreateOpenAiCompatibleAdapterOptions {
  id: PricingEntry["providerId"];
  displayName: string;
  fetch: typeof globalThis.fetch;
  pricing: PricingTable;
  defaultEndpoint: string;
  authHeader?: "authorization" | "x-api-key";
  includeVerbosity?: boolean;
  includeResponseFormat?: boolean;
  reasoningModelMaxTokens?: number;
  reasoningRequestFields?: (model: PricingEntry) => Record<string, unknown>;
  headers?: Record<string, string>;
  mapRequestModelId?: (modelId: string) => string;
}

interface ChatCompletionResponse {
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

const REASONING_MODEL_MAX_TOKENS = 2_048;
const NON_REASONING_MODEL_MAX_TOKENS = 200;

function contentToText(content: unknown): string | null {
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

function extractUsage(response: ChatCompletionResponse): {
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
} | null {
  const usage = response.usage;
  if (
    usage === undefined ||
    typeof usage.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number"
  ) {
    return null;
  }

  const reasoningTokens =
    usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? null;

  return {
    tokensIn: usage.prompt_tokens,
    tokensOut: usage.completion_tokens,
    reasoningTokens,
  };
}

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

function translateHttpError(providerId: string, error: unknown): ProviderError | null {
  if (error instanceof NonRetriable4xxError) {
    return new ProviderError({
      kind: "unreachable",
      code: codeForNonRetriableStatus(error.status),
      providerId,
      message: error.message,
      status: error.status,
      cause: httpFailureCause(error),
    });
  }

  if (error instanceof TransientFailureError) {
    return new ProviderError({
      kind: "transient",
      code: codeForTransientStatus(error.status, error.message),
      providerId,
      message: error.message,
      cause: httpFailureCause(error),
    });
  }

  return null;
}

function authHeaders(
  apiKey: string,
  header: CreateOpenAiCompatibleAdapterOptions["authHeader"],
): Record<string, string> {
  if (header === "x-api-key") {
    return { "x-api-key": apiKey };
  }

  return { Authorization: `Bearer ${apiKey}` };
}

function resolveCallReasoningEnabled(
  model: ProviderModel,
  requested: boolean | undefined,
): boolean {
  if (!model.hasReasoning || model.reasoningMode === "forced_off") {
    return false;
  }

  if (model.reasoningMode === "forced_on") {
    return true;
  }

  return requested ?? true;
}

export function createOpenAiCompatibleAdapter(
  options: CreateOpenAiCompatibleAdapterOptions,
): ProviderAdapter {
  const entries = listProviderPricing(options.id, options.pricing);
  const entryById = new Map(entries.map((entry) => [entry.modelId, entry]));
  const models = entries.map((entry) => ({
    id: entry.modelId,
    displayName: entry.displayName,
    hasReasoning: entry.hasReasoning,
    reasoningMode: entry.reasoningMode ?? reasoningModeForEntry(entry),
  }));
  const modelById = new Map(models.map((model) => [model.id, model]));

  return {
    id: options.id,
    models,

    async call(input, signal): Promise<ProviderCallOutput> {
      const model = modelById.get(input.modelId);
      const entry = entryById.get(input.modelId);
      if (model === undefined || entry === undefined) {
        throw new ProviderError({
          kind: "unreachable",
          code: "unsupported_model",
          providerId: options.id,
          message: "Provider model is not supported",
          status: 400,
          cause: input.modelId,
        });
      }

      const startedAt = Date.now();
      const reasoningEnabled = resolveCallReasoningEnabled(model, input.reasoningEnabled);
      const maxTokens = reasoningEnabled
        ? (options.reasoningModelMaxTokens ?? REASONING_MODEL_MAX_TOKENS)
        : NON_REASONING_MODEL_MAX_TOKENS;
      const reasoningFields = reasoningEnabled
        ? (options.reasoningRequestFields?.(entry) ?? {
            reasoning: { effort: "minimal", exclude: true },
          })
        : {};
      let responseText: string;
      try {
        responseText = await requestText(
          {
            fetch: options.fetch,
            url: entry.endpoint ?? options.defaultEndpoint,
            init: {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...authHeaders(input.apiKey, options.authHeader),
                ...options.headers,
              },
              body: JSON.stringify({
                model: options.mapRequestModelId?.(input.modelId) ?? input.modelId,
                stream: false,
                temperature: 0,
                max_tokens: maxTokens,
                ...(options.includeVerbosity === false ? {} : { verbosity: "low" }),
                ...reasoningFields,
                ...(options.includeResponseFormat === false
                  ? {}
                  : { response_format: { type: "json_object" } }),
                messages: [
                  {
                    role: "system",
                    content: input.systemPrompt,
                  },
                  {
                    role: "user",
                    content: buildProviderUserText(input),
                  },
                ],
                // Vision-based fallback temporarily disabled. To re-enable, replace the
                // user content above with a multipart array that includes:
                //   { type: "image_url", image_url: { url: encodePngDataUrl(input.boardPng) } }
                // and ensure engine.ts populates `boardPng`.
              }),
            },
          },
          signal,
        );
      } catch (error) {
        const providerError = translateHttpError(options.id, error);
        if (providerError !== null) {
          throw providerError;
        }

        throw error;
      }

      let response: ChatCompletionResponse;
      try {
        response = JSON.parse(responseText) as ChatCompletionResponse;
      } catch {
        return {
          rawText: responseText,
          tokensIn: 0,
          tokensOut: 0,
          reasoningTokens: null,
          costUsdMicros: 0,
          durationMs: Date.now() - startedAt,
        };
      }

      const rawText = contentToText(response.choices?.[0]?.message?.content);
      const usage = extractUsage(response);

      if (rawText === null || usage === null) {
        throw new ProviderError({
          kind: "transient",
          code: "malformed_response",
          providerId: options.id,
          message: "Provider response did not include text content and token usage",
          cause: JSON.stringify(response),
        });
      }

      return {
        rawText,
        ...usage,
        costUsdMicros: calculateCostUsdMicros(options.id, input.modelId, usage, options.pricing),
        durationMs: Date.now() - startedAt,
      };
    },
  };
}
