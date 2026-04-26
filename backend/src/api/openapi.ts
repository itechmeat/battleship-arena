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

function errorResponse(description: string, codes: readonly string[]) {
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

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "BattleShipArena API",
    version: "0.1.0",
    description: [
      "HTTP API for the BattleShipArena benchmark backend.",
      "",
      "All endpoints are namespaced under `/api`. Error responses use the shared closed-set envelope `{ error: { code, message, detail? } }`. SSE streams carry `Last-Event-ID` for reconnect.",
      "",
      "Canonical behaviour specs live under `openspec/specs/` and `docs/spec.md` section 5.2.",
    ].join("\n"),
  },
  servers: [
    {
      url: "/api",
      description: "Backend API root (served behind Caddy on production).",
    },
  ],
  tags: [
    { name: "system", description: "Health and platform status." },
    {
      name: "runs",
      description: "Start, observe, and abort a Battleship run.",
    },
    {
      name: "catalog",
      description: "Providers, pricing, and the daily board preview.",
    },
    {
      name: "leaderboard",
      description: "Ranked results for today and all-time.",
    },
    { name: "docs", description: "API documentation surface." },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["system"],
        summary: "Liveness probe",
        description: "Returns a static payload identifying the backend build.",
        responses: {
          "200": {
            description: "Service is live.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/board": {
      get: {
        tags: ["catalog"],
        summary: "Render today's or an archived seed's board",
        description:
          "Returns the empty 10x10 board as PNG for the seed date. Future dates and malformed dates reject with `invalid_input`.",
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            schema: { type: "string", format: "date", example: "2026-04-24" },
            description:
              "UTC date in YYYY-MM-DD form. Absent means today. Values strictly after today are rejected.",
          },
        ],
        responses: {
          "200": {
            description:
              "Board PNG. Explicit dates are `Cache-Control: public, max-age=86400, immutable`; absent date is `no-cache, must-revalidate`.",
            headers: {
              "Cache-Control": { schema: { type: "string" } },
              ETag: { schema: { type: "string" } },
            },
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
          "304": {
            description: "Not modified (if `If-None-Match` matched the ETag).",
          },
          "400": errorResponse("Malformed or future date.", ["invalid_input"]),
        },
      },
    },
    "/providers": {
      get: {
        tags: ["catalog"],
        summary: "List priced providers and models",
        description:
          "Returns the full priced catalog grouped by provider. Prices are serialised as USD decimals per 1M tokens. `mock` is excluded from this response; staging web builds inject it client-side for test coverage.",
        responses: {
          "200": {
            description: "Provider catalog.",
            headers: {
              "Cache-Control": {
                schema: { type: "string" },
                description: "`public, max-age=60`.",
              },
              ETag: { schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProvidersResponse" },
              },
            },
          },
          "304": { description: "Not modified." },
        },
      },
    },
    "/runs": {
      post: {
        tags: ["runs"],
        summary: "Start a new run",
        description:
          "Allocates a run ID, persists a `runs` row in state `running`, and spawns an in-process task that drives the game loop. The API key is consumed into the task closure and never echoed. Returns the run id synchronously; subscribe to `/runs/{id}/events` for live turns.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StartRunRequest" },
              examples: {
                realRun: {
                  summary: "Run a real provider with a user-supplied key",
                  value: {
                    providerId: "zai",
                    modelId: "zai/glm-5.1",
                    apiKey: "zai-xxxxxxxx",
                    reasoningEnabled: true,
                    budgetUsd: 0.25,
                  },
                },
                mockRun: {
                  summary: "Drive a deterministic mock run (staging/dev only)",
                  value: {
                    providerId: "mock",
                    modelId: "mock-happy",
                    apiKey: "placeholder",
                    reasoningEnabled: false,
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Run id of the started run.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StartRunResponse" },
              },
            },
          },
          "400": errorResponse(
            "Invalid input (missing fields, unknown provider/model, negative budget).",
            ["invalid_input"],
          ),
          "429": errorResponse("Too many simultaneously-active runs for this client session.", [
            "too_many_active_runs",
            "rate_limited",
          ]),
          "503": errorResponse("Backend is draining (soft maintenance).", ["maintenance_soft"]),
        },
      },
    },
    "/runs/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", description: "ULID." },
        },
      ],
      get: {
        tags: ["runs"],
        summary: "Get run metadata",
        description: "Returns aggregate metadata for a run. Does not include the API key.",
        responses: {
          "200": {
            description: "Run metadata.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RunMeta" },
              },
            },
          },
          "404": errorResponse("Run not found.", ["run_not_found"]),
        },
      },
    },
    "/runs/{id}/shots": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["runs"],
        summary: "List shots for a run",
        description:
          "Returns the full shot history for a run (used for archived replay). Each row carries the parsed shot plus tokens, cost, and (if applicable) `llm_error` for transient-error turns.",
        responses: {
          "200": {
            description: "Shot list.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RunShotsResponse" },
              },
            },
          },
          "404": errorResponse("Run not found.", ["run_not_found"]),
        },
      },
    },
    "/runs/{id}/events": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["runs"],
        summary: "Live SSE stream for a run",
        description: [
          "Server-Sent Events stream. Events are one of `open`, `shot`, `resync`, `outcome`. After the terminal `outcome` event the stream closes.",
          "",
          "Resume is supported via the standard `Last-Event-ID` request header, or via a `?lastEventId=<n>` query parameter for environments that cannot set custom headers on EventSource.",
          "",
          "For runs that already reached a terminal state, the backend synthesises a replay stream (open -> all shots -> outcome) from the persisted rows.",
        ].join("\n"),
        parameters: [
          {
            name: "Last-Event-ID",
            in: "header",
            required: false,
            schema: { type: "string" },
            description: "Standard SSE resume marker.",
          },
          {
            name: "lastEventId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Fallback resume marker for clients that cannot set a Last-Event-ID header. Sent as a string to match the EventSource reconnect format; the handler parses it to a number when reading the ring.",
          },
        ],
        responses: {
          "200": {
            description:
              "SSE stream. Each message is a JSON body conforming to one of the SSE event variants.",
            headers: { "Cache-Control": { schema: { type: "string" } } },
            content: {
              "text/event-stream": {
                schema: { $ref: "#/components/schemas/SseEvent" },
              },
            },
          },
        },
      },
    },
    "/runs/{id}/abort": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      post: {
        tags: ["runs"],
        summary: "Abort a running run",
        description:
          "Requests the run task to finish with outcome `aborted_viewer`. If the run already terminated, the current outcome is returned unchanged.",
        responses: {
          "200": {
            description:
              "Final outcome (may be an earlier terminal state if the run already ended).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AbortRunResponse" },
              },
            },
          },
          "404": errorResponse("Run not found.", ["run_not_found"]),
        },
      },
    },
    "/leaderboard": {
      get: {
        tags: ["leaderboard"],
        summary: "Ranked leaderboard",
        description:
          "Returns ranked rows keyed by exact `(providerId, modelId)`. The today scope returns each model's best session-deduped won run; the all-time scope returns the classical median of session-deduped wins across seed dates.",
        parameters: [
          {
            name: "scope",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["today", "all"] },
          },
          {
            name: "providerId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Narrow to a single provider.",
          },
          {
            name: "modelId",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Narrow to a single model id.",
          },
          {
            name: "reasoningEnabled",
            in: "query",
            required: false,
            schema: { type: "boolean" },
            description: "Narrow to runs with reasoning on or off.",
          },
        ],
        responses: {
          "200": {
            description: "Ranked rows.",
            headers: {
              "Cache-Control": {
                schema: { type: "string" },
                description: "`no-store` to avoid UTC-rollover staleness on the today scope.",
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LeaderboardResponse" },
              },
            },
          },
          "400": errorResponse("Missing or invalid scope.", ["invalid_input"]),
        },
      },
    },
    "/openapi.json": {
      get: {
        tags: ["docs"],
        summary: "Raw OpenAPI 3.1 document",
        description:
          "Returns this document in JSON form. Consumed by the Swagger UI page at `/api/docs` and by any external tooling that needs a machine-readable contract.",
        responses: {
          "200": {
            description: "OpenAPI 3.1 JSON document.",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/docs": {
      get: {
        tags: ["docs"],
        summary: "Swagger UI explorer",
        description:
          "Interactive Swagger UI. Lets an operator try every endpoint from a browser. Served as an HTML page that loads the JSON spec from `/api/openapi.json`.",
        responses: {
          "200": {
            description: "Swagger UI HTML page.",
            content: { "text/html": { schema: { type: "string" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
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
    },
  },
} as const;
