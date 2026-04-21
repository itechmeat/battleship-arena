import { describe, expect, test } from "bun:test";

import { createApp } from "../src/app.ts";

describe("createApp", () => {
  test("serves GET /api/health with the shared response shape", async () => {
    const app = createApp({
      version: "0.1.0",
      commitSha: "abc123",
      startedAt: 1_745_000_000_000,
    });

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      version: "0.1.0",
      commitSha: "abc123",
      startedAt: 1_745_000_000_000,
    });
  });

  test("serializes unknown routes with the not_found error envelope", async () => {
    const app = createApp({
      version: "0.1.0",
      commitSha: "unknown",
      startedAt: 1_745_000_000_000,
    });

    const response = await app.request("/api/missing");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    });
  });
});
