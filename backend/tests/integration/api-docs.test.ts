import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { createDocsRouter } from "../../src/api/docs.ts";

const EXPECTED_PATHS = [
  "/health",
  "/board",
  "/providers",
  "/runs",
  "/runs/{id}",
  "/runs/{id}/shots",
  "/runs/{id}/events",
  "/runs/{id}/abort",
  "/leaderboard",
  "/openapi.json",
  "/docs",
] as const;

function buildApp() {
  const app = new Hono();
  app.route("/api", createDocsRouter());
  return app;
}

describe("GET /api/openapi.json", () => {
  test("returns an OpenAPI 3.1 document with every existing route", async () => {
    const response = await buildApp().request("/api/openapi.json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe("BattleShipArena API");
    expect(body.info.version.length).toBeGreaterThan(0);

    for (const path of EXPECTED_PATHS) {
      expect(body.paths[path]).toBeTruthy();
    }
  });

  test("defines the shared schemas the handlers reference", async () => {
    const response = await buildApp().request("/api/openapi.json");
    const body = (await response.json()) as {
      components: { schemas: Record<string, unknown> };
    };
    for (const name of [
      "ErrorEnvelope",
      "HealthResponse",
      "ShotResult",
      "Outcome",
      "ProvidersResponse",
      "RunMeta",
      "RunShotRow",
      "LeaderboardResponse",
      "SseEvent",
      "StartRunRequest",
      "StartRunResponse",
      "AbortRunResponse",
    ]) {
      expect(body.components.schemas[name]).toBeTruthy();
    }
  });

  test("advertises the POST /runs request body with providerId, modelId, apiKey, budgetUsd", async () => {
    const response = await buildApp().request("/api/openapi.json");
    const body = (await response.json()) as {
      components: {
        schemas: Record<
          string,
          { properties?: Record<string, unknown>; required?: readonly string[] }
        >;
      };
    };
    const schema = body.components.schemas.StartRunRequest;
    if (schema === undefined) throw new Error("StartRunRequest schema missing");
    expect(schema.required).toEqual(expect.arrayContaining(["providerId", "modelId", "apiKey"]));
    expect(schema.properties).toEqual(
      expect.objectContaining({
        providerId: expect.any(Object),
        modelId: expect.any(Object),
        apiKey: expect.any(Object),
        budgetUsd: expect.any(Object),
      }),
    );
  });
});

describe("GET /api/docs", () => {
  test("serves the Swagger UI HTML page referencing /api/openapi.json", async () => {
    const response = await buildApp().request("/api/docs");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html.toLowerCase()).toContain("swagger");
    expect(html).toContain("/api/openapi.json");
  });
});
