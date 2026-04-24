import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { createProvidersRouter } from "../../src/api/providers.ts";

describe("GET /api/providers", () => {
  test("returns real providers, excludes mock, and supports ETag 304", async () => {
    const app = new Hono();
    app.route("/api", createProvidersRouter());

    const response = await app.request("/api/providers");
    const body = (await response.json()) as {
      providers: Array<{
        id: string;
        models: Array<{
          pricing: { inputUsdPerMtok: number; outputUsdPerMtok: number };
          estimatedPromptTokens: number;
          estimatedImageTokens: number;
          estimatedOutputTokensPerShot: number;
          estimatedCostRange: { minUsd: number; maxUsd: number };
          priceSource: string;
          lastReviewedAt: string;
        }>;
      }>;
    };
    const etag = response.headers.get("etag");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(etag).toBeTruthy();
    expect(body.providers.map((provider) => provider.id).sort()).toEqual([
      "opencode-go",
      "openrouter",
    ]);
    const openrouter = body.providers.find((provider) => provider.id === "openrouter");
    if (openrouter === undefined) {
      throw new Error("api-providers: openrouter entry missing from response");
    }
    const firstModel = openrouter.models[0];
    if (firstModel === undefined) {
      throw new Error("api-providers: openrouter.models is empty");
    }
    expect(firstModel).toEqual(
      expect.objectContaining({
        estimatedPromptTokens: expect.any(Number),
        estimatedImageTokens: expect.any(Number),
        estimatedOutputTokensPerShot: expect.any(Number),
        estimatedCostRange: expect.objectContaining({
          minUsd: expect.any(Number),
          maxUsd: expect.any(Number),
        }),
        priceSource: expect.any(String),
        lastReviewedAt: "2026-04-24",
      }),
    );
    expect(firstModel.pricing).toEqual(
      expect.objectContaining({
        inputUsdPerMtok: expect.any(Number),
        outputUsdPerMtok: expect.any(Number),
      }),
    );
    expect(JSON.stringify(body)).not.toContain("mock");

    const cached = await app.request("/api/providers", {
      headers: {
        "If-None-Match": etag ?? "",
      },
    });

    expect(cached.status).toBe(304);
    expect(cached.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await cached.text()).toBe("");
  });
});
