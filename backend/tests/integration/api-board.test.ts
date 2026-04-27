import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { DEFAULT_BENCHMARK_SEED_DATE } from "@battleship-arena/shared";

import { createBoardRouter } from "../../src/api/board.ts";

describe("GET /api/board", () => {
  test("past date returns deterministic image/png with immutable caching", async () => {
    const app = new Hono();
    app.route("/api", createBoardRouter({ todayUtc: () => "2026-04-24" }));

    const first = await app.request("/api/board?date=2026-04-20");
    const second = await app.request("/api/board?date=2026-04-20");

    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    expect(first.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(first.headers.get("etag")).toBe(second.headers.get("etag"));
    expect(await first.arrayBuffer()).toEqual(await second.arrayBuffer());
  });

  test("absent date uses the fixed default benchmark seed", async () => {
    const app = new Hono();
    app.route("/api", createBoardRouter({ todayUtc: () => "2026-04-24" }));

    const response = await app.request("/api/board");
    const explicitDefault = await app.request(`/api/board?date=${DEFAULT_BENCHMARK_SEED_DATE}`);

    expect(response.status).toBe(200);
    expect(explicitDefault.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400, immutable");
    expect(response.headers.get("etag")).toBe(explicitDefault.headers.get("etag"));
  });

  test("absent date allows the fixed default seed before that calendar date", async () => {
    const app = new Hono();
    app.route("/api", createBoardRouter({ todayUtc: () => "2026-04-20" }));

    const response = await app.request("/api/board");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  test("matching If-None-Match returns 304", async () => {
    const app = new Hono();
    app.route("/api", createBoardRouter({ todayUtc: () => "2026-04-24" }));
    const first = await app.request("/api/board?date=2026-04-20");

    const cached = await app.request("/api/board?date=2026-04-20", {
      headers: { "If-None-Match": first.headers.get("etag") ?? "" },
    });

    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe("");
  });

  test("future and malformed dates reject invalid_input", async () => {
    const app = new Hono();
    app.route("/api", createBoardRouter({ todayUtc: () => "2026-04-24" }));

    const future = await app.request("/api/board?date=2026-04-25");
    const malformed = await app.request("/api/board?date=2026-13-40");

    expect(future.status).toBe(400);
    expect(await future.json()).toEqual({
      error: {
        code: "invalid_input",
        message: "Invalid input",
        detail: { date: "future" },
      },
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe("invalid_input");
  });
});
