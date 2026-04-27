import {
  calculateCostUsdMicros,
  type PricingEntry,
  type PricingTable,
} from "../pricing/catalog.ts";

import { ProviderError } from "./errors.ts";
import { requestText } from "./http.ts";
import {
  createProviderModelLookup,
  resolveProviderReasoningEnabled,
  supportsProviderResponseFormat,
} from "./model-helpers.ts";
import {
  extractOpenAiUsage,
  openAiContentToText,
  type OpenAiChatCompletionResponse,
} from "./openai-response.ts";
import { translateProviderHttpError } from "./provider-error-translation.ts";
import type { ProviderAdapter, ProviderCallOutput } from "./types.ts";
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

const REASONING_MODEL_MAX_TOKENS = 2_048;
const NON_REASONING_MODEL_MAX_TOKENS = 200;

function translateHttpError(providerId: string, error: unknown): ProviderError | null {
  const translated = translateProviderHttpError(error);
  if (translated !== null) {
    return new ProviderError({ providerId, ...translated });
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

export function createOpenAiCompatibleAdapter(
  options: CreateOpenAiCompatibleAdapterOptions,
): ProviderAdapter {
  const { entryById, models, modelById } = createProviderModelLookup(options.id, options.pricing);

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
      const reasoningEnabled = resolveProviderReasoningEnabled(model, input.reasoningEnabled);
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
                ...(options.includeResponseFormat === false ||
                !supportsProviderResponseFormat(entry)
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

      let response: OpenAiChatCompletionResponse;
      try {
        response = JSON.parse(responseText) as OpenAiChatCompletionResponse;
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

      const rawText = openAiContentToText(response.choices?.[0]?.message?.content);
      const usage = extractOpenAiUsage(response);

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
