import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import { generateUlid } from "../db/ulid.ts";

const SESSION_COOKIE = "bsa_session";
const SESSION_MAX_AGE_SECONDS = 31_536_000;
const sessionIds = new WeakMap<Context, string>();

export const sessionMiddleware: MiddlewareHandler = async (context, next) => {
  let sessionId = getCookie(context, SESSION_COOKIE);

  if (sessionId === undefined) {
    sessionId = generateUlid();
    setCookie(context, SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  sessionIds.set(context, sessionId);
  await next();
};

export function readSession(context: Context): string {
  const sessionId = sessionIds.get(context);
  if (sessionId === undefined) {
    throw new Error("Session middleware must run before readSession");
  }

  return sessionId;
}
