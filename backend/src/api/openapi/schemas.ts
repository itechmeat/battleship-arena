import { ERROR_CODES, OUTCOMES } from "@battleship-arena/shared";

const SHOT_RESULTS = [
  "hit",
  "miss",
  "sunk",
  "schema_error",
  "invalid_coordinate",
  "timeout",
] as const;
const CELL_STATES = ["unknown", "miss", "hit", "sunk"] as const;
const REASONING_MODES = ["optional", "forced_on", "forced_off"] as const;

const errorEnvelopeSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: [...ERROR_CODES] },
        message: { type: "string" },
        detail: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
} as const;

const shotResultSchema = {
  type: "string",
  enum: [...SHOT_RESULTS],
} as const;

const outcomeSchema = {
  type: "string",
  enum: [...OUTCOMES],
} as const;

const healthResponseSchema = {
  type: "object",
  required: ["status", "version", "commitSha", "startedAt"],
  properties: {
    status: { type: "string", enum: ["ok"] },
    version: { type: "string", example: "0.1.0" },
    commitSha: { type: "string", example: "ecac48f" },
    startedAt: {
      type: "integer",
      format: "int64",
      description: "Unix milliseconds timestamp of when the backend booted.",
    },
  },
} as const;

const modelPricingViewSchema = {
  type: "object",
  required: ["inputUsdPerMtok", "outputUsdPerMtok"],
  properties: {
    inputUsdPerMtok: {
      type: "number",
      description: "USD per 1,000,000 input tokens.",
    },
    outputUsdPerMtok: {
      type: "number",
      description: "USD per 1,000,000 output tokens.",
    },
  },
} as const;

const modelCostEstimateSchema = {
  type: "object",
  required: ["minUsd", "maxUsd"],
  properties: {
    minUsd: { type: "number", description: "17-shot perfect win." },
    maxUsd: { type: "number", description: "100-shot cap." },
  },
} as const;

const providersResponseModelSchema = {
  type: "object",
  required: [
    "id",
    "displayName",
    "hasReasoning",
    "reasoningMode",
    "pricing",
    "estimatedPromptTokens",
    "estimatedImageTokens",
    "estimatedOutputTokensPerShot",
    "estimatedCostRange",
    "priceSource",
    "lastReviewedAt",
  ],
  properties: {
    id: { type: "string", example: "zai/glm-5.1" },
    displayName: { type: "string", example: "GLM-5.1" },
    hasReasoning: { type: "boolean" },
    reasoningMode: { type: "string", enum: [...REASONING_MODES] },
    pricing: { $ref: "#/components/schemas/ModelPricingView" },
    estimatedPromptTokens: { type: "integer" },
    estimatedImageTokens: { type: "integer" },
    estimatedOutputTokensPerShot: { type: "integer" },
    estimatedCostRange: { $ref: "#/components/schemas/ModelCostEstimate" },
    priceSource: { type: "string", format: "uri" },
    lastReviewedAt: { type: "string", format: "date", example: "2026-04-24" },
  },
} as const;

const providersResponseProviderSchema = {
  type: "object",
  required: ["id", "displayName", "models"],
  properties: {
    id: { type: "string", example: "zai" },
    displayName: { type: "string", example: "Z.AI" },
    models: {
      type: "array",
      items: { $ref: "#/components/schemas/ProvidersResponseModel" },
    },
  },
} as const;

const providersResponseSchema = {
  type: "object",
  required: ["providers"],
  properties: {
    providers: {
      type: "array",
      items: { $ref: "#/components/schemas/ProvidersResponseProvider" },
    },
  },
} as const;

const runMetaSchema = {
  type: "object",
  required: [
    "id",
    "seedDate",
    "providerId",
    "modelId",
    "displayName",
    "reasoningEnabled",
    "startedAt",
    "endedAt",
    "outcome",
    "shotsFired",
    "hits",
    "schemaErrors",
    "invalidCoordinates",
    "durationMs",
    "tokensIn",
    "tokensOut",
    "reasoningTokens",
    "costUsdMicros",
    "budgetUsdMicros",
    "terminalErrorCode",
    "terminalErrorStatus",
    "terminalErrorMessage",
  ],
  properties: {
    id: { type: "string", description: "ULID." },
    seedDate: { type: "string", format: "date", example: "2026-04-24" },
    providerId: { type: "string", example: "zai" },
    modelId: { type: "string", example: "zai/glm-5.1" },
    displayName: { type: "string", example: "GLM-5.1" },
    reasoningEnabled: { type: "boolean" },
    startedAt: { type: "integer", format: "int64" },
    endedAt: { type: ["integer", "null"], format: "int64" },
    outcome: {
      oneOf: [{ $ref: "#/components/schemas/Outcome" }, { type: "null" }],
    },
    shotsFired: { type: "integer" },
    hits: { type: "integer" },
    schemaErrors: { type: "integer" },
    invalidCoordinates: { type: "integer" },
    durationMs: { type: "integer" },
    tokensIn: { type: "integer" },
    tokensOut: { type: "integer" },
    reasoningTokens: { type: ["integer", "null"] },
    costUsdMicros: {
      type: "integer",
      description: "USD * 1,000,000 for the full run. Written once at terminal state.",
    },
    budgetUsdMicros: {
      type: ["integer", "null"],
      description: "User-declared budget cap in integer micros; null or 0 means no cap.",
    },
    terminalErrorCode: {
      type: ["string", "null"],
      description:
        "Provider error code for terminal provider failures, such as auth, quota, or rate_limited.",
    },
    terminalErrorStatus: {
      type: ["integer", "null"],
      description: "HTTP status for terminal provider failures when available.",
    },
    terminalErrorMessage: {
      type: ["string", "null"],
      description: "Redacted provider failure details for terminal no-shot outcomes.",
    },
  },
} as const;

const runShotRowSchema = {
  type: "object",
  required: [
    "runId",
    "idx",
    "row",
    "col",
    "result",
    "rawResponse",
    "reasoningText",
    "tokensIn",
    "tokensOut",
    "reasoningTokens",
    "costUsdMicros",
    "durationMs",
    "createdAt",
  ],
  properties: {
    runId: { type: "string" },
    idx: { type: "integer", description: "0-based position in the run." },
    row: { type: ["integer", "null"], minimum: 0, maximum: 9 },
    col: { type: ["integer", "null"], minimum: 0, maximum: 9 },
    result: { $ref: "#/components/schemas/ShotResult" },
    rawResponse: { type: "string" },
    reasoningText: { type: ["string", "null"] },
    tokensIn: { type: "integer" },
    tokensOut: { type: "integer" },
    reasoningTokens: { type: ["integer", "null"] },
    costUsdMicros: { type: "integer" },
    durationMs: { type: "integer" },
    createdAt: { type: "integer", format: "int64" },
    llmError: {
      type: ["string", "null"],
      description: "Populated only on schema_error turns produced by a transient provider failure.",
    },
  },
} as const;

const leaderboardRowSchema = {
  type: "object",
  required: [
    "rank",
    "providerId",
    "modelId",
    "displayName",
    "reasoningEnabled",
    "shotsToWin",
    "runsCount",
    "bestRunId",
  ],
  properties: {
    rank: { type: "integer", minimum: 1 },
    providerId: { type: "string" },
    modelId: { type: "string" },
    displayName: { type: "string" },
    reasoningEnabled: { type: "boolean" },
    shotsToWin: {
      type: "number",
      description:
        "Today scope: integer shots of the best won run. All-time scope: median shots-to-win; may be fractional (e.g. 22.5) for even-N samples.",
    },
    runsCount: { type: "integer" },
    bestRunId: {
      type: ["string", "null"],
      description: "Non-null only for the today scope (points to the exemplar run).",
    },
  },
} as const;

const leaderboardResponseSchema = {
  type: "object",
  required: ["scope", "seedDate", "rows"],
  properties: {
    scope: { type: "string", enum: ["today", "all"] },
    seedDate: {
      type: ["string", "null"],
      format: "date",
      description: "Populated for scope=today, null for scope=all.",
    },
    rows: {
      type: "array",
      items: { $ref: "#/components/schemas/LeaderboardRow" },
    },
  },
} as const;

const startRunRequestSchema = {
  type: "object",
  required: ["providerId", "modelId", "apiKey"],
  properties: {
    providerId: { type: "string", example: "zai" },
    modelId: { type: "string", example: "zai/glm-5.1" },
    apiKey: {
      type: "string",
      description:
        "Held only in the run task's closure. Never written to SQLite, never logged, never echoed in any response.",
    },
    reasoningEnabled: {
      type: "boolean",
      description:
        "Requested reasoning state. The backend resolves this against catalog policy: forced_on models persist true, forced_off models persist false, optional models persist the supplied value or true when omitted.",
    },
    budgetUsd: {
      type: ["number", "null"],
      description:
        "Optional budget cap in USD. Empty, null, or 0 persist as NULL (no cap). Negative values reject with invalid_input.",
    },
    mockCost: {
      type: "number",
      description:
        "Staging/development only. Accepted when providerId is 'mock'; ignored in production builds.",
    },
  },
} as const;

const startRunResponseSchema = {
  type: "object",
  required: ["runId"],
  properties: { runId: { type: "string" } },
} as const;

const runShotsResponseSchema = {
  type: "object",
  required: ["runId", "shots"],
  properties: {
    runId: { type: "string" },
    shots: {
      type: "array",
      items: { $ref: "#/components/schemas/RunShotRow" },
    },
  },
} as const;

const abortRunResponseSchema = {
  type: "object",
  required: ["outcome"],
  properties: {
    outcome: {
      oneOf: [{ $ref: "#/components/schemas/Outcome" }, { type: "null" }],
    },
  },
} as const;

const sseEventSchema = {
  oneOf: [
    {
      type: "object",
      required: ["kind", "id", "runId", "startedAt", "seedDate"],
      properties: {
        kind: { type: "string", enum: ["open"] },
        id: { type: "integer" },
        runId: { type: "string" },
        startedAt: { type: "integer", format: "int64" },
        seedDate: { type: "string", format: "date" },
      },
    },
    {
      type: "object",
      required: ["kind", "id", "idx", "row", "col", "result", "reasoning"],
      properties: {
        kind: { type: "string", enum: ["shot"] },
        id: { type: "integer" },
        idx: { type: "integer" },
        row: { type: ["integer", "null"] },
        col: { type: ["integer", "null"] },
        result: { $ref: "#/components/schemas/ShotResult" },
        reasoning: { type: ["string", "null"] },
      },
    },
    {
      type: "object",
      required: ["kind", "id"],
      properties: {
        kind: { type: "string", enum: ["resync"] },
        id: { type: "integer" },
      },
    },
    {
      type: "object",
      required: [
        "kind",
        "id",
        "outcome",
        "shotsFired",
        "hits",
        "schemaErrors",
        "invalidCoordinates",
        "endedAt",
      ],
      properties: {
        kind: { type: "string", enum: ["outcome"] },
        id: { type: "integer" },
        outcome: { $ref: "#/components/schemas/Outcome" },
        shotsFired: { type: "integer" },
        hits: { type: "integer" },
        schemaErrors: { type: "integer" },
        invalidCoordinates: { type: "integer" },
        endedAt: { type: "integer", format: "int64" },
      },
    },
  ],
} as const;

const boardViewSchema = {
  type: "object",
  required: ["size", "cells"],
  properties: {
    size: { type: "integer", enum: [10] },
    cells: {
      type: "array",
      items: { type: "string", enum: [...CELL_STATES] },
      minItems: 100,
      maxItems: 100,
    },
  },
} as const;

export function errorResponse(description: string, codes: readonly string[]) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorEnvelope" },
        examples: Object.fromEntries(
          codes.map((code) => [
            code,
            {
              value: {
                error: { code, message: `Example ${code} message.` },
              },
            },
          ]),
        ),
      },
    },
  } as const;
}

export const componentSchemas = {
  ErrorEnvelope: errorEnvelopeSchema,
  HealthResponse: healthResponseSchema,
  ShotResult: shotResultSchema,
  Outcome: outcomeSchema,
  BoardView: boardViewSchema,
  ModelPricingView: modelPricingViewSchema,
  ModelCostEstimate: modelCostEstimateSchema,
  ProvidersResponseModel: providersResponseModelSchema,
  ProvidersResponseProvider: providersResponseProviderSchema,
  ProvidersResponse: providersResponseSchema,
  RunMeta: runMetaSchema,
  RunShotRow: runShotRowSchema,
  RunShotsResponse: runShotsResponseSchema,
  StartRunRequest: startRunRequestSchema,
  StartRunResponse: startRunResponseSchema,
  AbortRunResponse: abortRunResponseSchema,
  LeaderboardRow: leaderboardRowSchema,
  LeaderboardResponse: leaderboardResponseSchema,
  SseEvent: sseEventSchema,
} as const;
