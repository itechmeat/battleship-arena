import { Hono } from "hono";

import { createHealthRouter, type HealthRouteMetadata } from "./api/health.ts";
import { createRunsRouter, type RunsRouterDeps } from "./api/runs.ts";
import { sessionMiddleware } from "./api/session.ts";
import { respondError } from "./errors.ts";

export function createApp(metadata: HealthRouteMetadata, runs?: RunsRouterDeps) {
  const app = new Hono();

  app.use(sessionMiddleware);
  app.route("/api", createHealthRouter(metadata));

  if (runs !== undefined) {
    app.route("/api", createRunsRouter(runs));
  }

  app.notFound((context) => respondError(context, "not_found", 404, "Route not found"));

  app.onError((error, context) => {
    console.error(error);

    return respondError(context, "internal", 500, "Internal server error");
  });

  return app;
}
