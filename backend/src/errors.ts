import type { ErrorCode, ErrorEnvelope } from "@battleship-arena/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function respondError(
  context: Context,
  code: ErrorCode,
  status: ContentfulStatusCode,
  message: string,
  detail?: Record<string, unknown>,
) {
  const body: ErrorEnvelope =
    detail === undefined ? { error: { code, message } } : { error: { code, message, detail } };

  return context.json(body, { status });
}
