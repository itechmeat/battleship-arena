import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { readSession, sessionMiddleware } from "../../src/api/session.ts";

describe("sessionMiddleware", () => {
  test("absent cookie triggers Set-Cookie", async () => {
    const app = new Hono();
    app.use(sessionMiddleware);
    app.get("/session", (context) => context.json({ session: readSession(context) }));

    const response = await app.request("/session");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.session).toBe("string");
    expect(response.headers.get("set-cookie")).toContain("bsa_session=");
  });

  test("present cookie is read through without rotation", async () => {
    const app = new Hono();
    app.use(sessionMiddleware);
    app.get("/session", (context) => context.json({ session: readSession(context) }));

    const response = await app.request("/session", {
      headers: {
        Cookie: "bsa_session=session-123",
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: "session-123" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("readSession throws when middleware is missing", async () => {
    const app = new Hono();
    app.get("/session", (context) => context.json({ session: readSession(context) }));

    const response = await app.request("/session");

    expect(response.status).toBe(500);
  });
});
