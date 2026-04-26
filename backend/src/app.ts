import { Hono } from "hono";

import { createBoardRouter } from "./api/board.ts";
import { createDocsRouter } from "./api/docs.ts";
import { createHealthRouter, type HealthRouteMetadata } from "./api/health.ts";
import { createLeaderboardRouter } from "./api/leaderboard.ts";
import { createProvidersRouter } from "./api/providers.ts";
import { createRunsRouter, type RunsRouterDeps } from "./api/runs.ts";
import { sessionMiddleware } from "./api/session.ts";
import { respondError } from "./errors.ts";

export function createApp(metadata: HealthRouteMetadata, runs?: RunsRouterDeps) {
  const app = new Hono();

  app.use(sessionMiddleware);
  app.route("/api", createHealthRouter(metadata));
  app.route("/api", createBoardRouter());
  app.route("/api", createProvidersRouter());
  app.route("/api", createDocsRouter());

  if (runs !== undefined) {
    app.route("/api", createRunsRouter(runs));
    app.route("/api", createLeaderboardRouter({ queries: runs.queries }));
  }

  app.notFound((context) => respondError(context, "not_found", 404, "Route not found"));

  app.onError((error, context) => {
    console.error(error);

    return respondError(context, "internal", 500, "Internal server error");
  });

  return app;
}
