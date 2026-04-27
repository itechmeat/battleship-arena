import { componentSchemas, errorResponse } from "./openapi/schemas.ts";

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
      description: "Providers, pricing, and the default board preview.",
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
        summary: "Render the default or a custom seed's board",
        description:
          "Returns the empty 10x10 board as PNG for the fixed default benchmark seed or an explicit custom seed date. Future dates and malformed dates reject with `invalid_input`.",
        parameters: [
          {
            name: "date",
            in: "query",
            required: false,
            schema: { type: "string", format: "date", example: "2026-04-24" },
            description:
              "UTC date in YYYY-MM-DD form. Absent means the fixed default benchmark seed. Values strictly after today are rejected.",
          },
        ],
        responses: {
          "200": {
            description: "Board PNG with `Cache-Control: public, max-age=86400, immutable`.",
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
          "Allocates a run ID for the fixed default benchmark seed, persists a `runs` row in state `running`, and spawns an in-process task that drives the game loop. The API key is consumed into the task closure and never echoed. Returns the run id synchronously; subscribe to `/runs/{id}/events` for live turns.",
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
          "Returns ranked rows keyed by exact `(providerId, modelId)`. The today scope returns each model's best session-deduped won run for the fixed default benchmark seed; the all-time scope returns the classical median of session-deduped wins across seed dates.",
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
                description: "`no-store` so leaderboard rows always reflect newly completed runs.",
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
    schemas: componentSchemas,
  },
} as const;
