import { swaggerUI } from "@hono/swagger-ui";
import { Hono } from "hono";

import { OPENAPI_DOCUMENT } from "./openapi.ts";

export function createDocsRouter() {
  const router = new Hono();

  router.get("/openapi.json", (context) => {
    context.header("Cache-Control", "public, max-age=60");
    return context.json(OPENAPI_DOCUMENT, 200);
  });

  router.get("/docs", swaggerUI({ url: "/api/openapi.json" }));

  return router;
}
