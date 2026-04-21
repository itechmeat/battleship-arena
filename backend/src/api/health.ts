import type { HealthResponse } from "@battleship-arena/shared";
import { Hono } from "hono";

export interface HealthRouteMetadata {
  version: string;
  commitSha: string;
  startedAt: number;
}

export function createHealthRouter(metadata: HealthRouteMetadata) {
  const router = new Hono();

  router.get("/health", (context) => {
    const response: HealthResponse = {
      status: "ok",
      version: metadata.version,
      commitSha: metadata.commitSha,
      startedAt: metadata.startedAt,
    };

    return context.json(response, 200);
  });

  return router;
}
