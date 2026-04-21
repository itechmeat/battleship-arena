import { Hono } from "hono";

import { createHealthRouter, type HealthRouteMetadata } from "./api/health.ts";
import { respondError } from "./errors.ts";

export function createApp(metadata: HealthRouteMetadata) {
  const app = new Hono();

  app.route("/api", createHealthRouter(metadata));

  app.notFound((context) => respondError(context, "not_found", 404, "Route not found"));

  app.onError((error, context) => {
    console.error(error);

    return respondError(context, "internal", 500, "Internal server error");
  });

  return app;
}
