import { SSE_HEARTBEAT_MS, type SseEvent } from "@battleship-arena/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { respondError } from "../errors.ts";
import type { Queries } from "../db/queries.ts";
import type { Manager } from "../runs/manager.ts";
import type { ProviderRegistry } from "../providers/types.ts";

import { readSession } from "./session.ts";

export interface RunsRouterDeps {
  manager: Pick<Manager, "start" | "abort" | "getHandle" | "shutdown">;
  queries: Queries;
  providers: ProviderRegistry;
}

const LIVE_RESUME_EVENT_ID_OFFSET = 2;

function parseLastEventId(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSseEventData(event: SseEvent): {
  event: string;
  id: string;
  data: string;
} {
  return {
    event: event.kind,
    id: String(event.id),
    data: JSON.stringify(event),
  };
}

function synthesizeTerminalReplay(deps: RunsRouterDeps, runId: string): SseEvent[] | null {
  const meta = deps.queries.getRunMeta(runId);
  if (meta === null || meta.outcome === null) {
    return null;
  }

  const shots = deps.queries.listShots(runId);
  const events: SseEvent[] = [
    {
      kind: "open",
      id: 0,
      runId,
      startedAt: meta.startedAt,
      seedDate: meta.seedDate,
    },
    ...shots.map((shot, index) => ({
      kind: "shot" as const,
      id: index + 1,
      idx: shot.idx,
      row: shot.row,
      col: shot.col,
      result: shot.result,
      reasoning: shot.reasoningText,
    })),
    {
      kind: "outcome",
      id: shots.length + 1,
      outcome: meta.outcome,
      shotsFired: meta.shotsFired,
      hits: meta.hits,
      schemaErrors: meta.schemaErrors,
      invalidCoordinates: meta.invalidCoordinates,
      endedAt: meta.endedAt ?? meta.startedAt,
    },
  ];

  return events;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  body: Record<string, unknown>,
  field: "providerId" | "modelId" | "apiKey",
): string | null {
  const value = body[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readOptionalBudgetUsd(body: Record<string, unknown>): number | undefined | null {
  const value = body.budgetUsd;
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function createRunsRouter(deps: RunsRouterDeps) {
  const router = new Hono();

  router.get("/runs/:id/events", (context) => {
    context.header("Cache-Control", "no-store");

    const runId = context.req.param("id");
    const terminalReplay = synthesizeTerminalReplay(deps, runId);
    if (terminalReplay !== null) {
      return streamSSE(context, async (stream) => {
        for (const event of terminalReplay) {
          await stream.writeSSE(toSseEventData(event));
        }

        await stream.close();
      });
    }

    const handle = deps.manager.getHandle(runId);
    if (handle === null) {
      return streamSSE(context, async (stream) => {
        await stream.writeSSE(
          toSseEventData({
            kind: "resync",
            id: 0,
          }),
        );
        await stream.close();
      });
    }

    return streamSSE(context, async (stream) => {
      const headerLastEventId = parseLastEventId(context.req.header("Last-Event-ID"));
      const queryLastShotIndex = parseLastEventId(context.req.query("lastEventId"));
      const lastEventId =
        headerLastEventId ??
        (queryLastShotIndex === null ? null : queryLastShotIndex + LIVE_RESUME_EVENT_ID_OFFSET);
      const backlog = handle.ring.since(lastEventId);

      if (backlog === "out_of_range") {
        await stream.writeSSE(
          toSseEventData({
            kind: "resync",
            id: 0,
          }),
        );
        await stream.close();
        return;
      }

      for (const event of backlog) {
        await stream.writeSSE(toSseEventData(event));
      }

      let resolveDone: (() => void) | null = null;
      let finished = false;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      const markFinished = () => {
        if (finished) {
          return false;
        }

        finished = true;
        return true;
      };
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let writeQueue = Promise.resolve();
      const cleanup = () => {
        if (!markFinished()) {
          return;
        }

        if (heartbeat !== undefined) {
          clearInterval(heartbeat);
        }

        handle.subscribers.delete(subscriber);
        resolveDone?.();
      };
      const queueWrite = (operation: () => Promise<void>) => {
        const next = writeQueue.then(
          async () => {
            if (finished) {
              return;
            }

            await operation();
          },
          async () => {
            if (finished) {
              return;
            }

            await operation();
          },
        );

        writeQueue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      };
      const writeEvent = async (event: SseEvent): Promise<boolean> => {
        if (finished || stream.closed || stream.aborted) {
          cleanup();
          return false;
        }

        try {
          await stream.writeSSE(toSseEventData(event));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };
      const writeHeartbeat = async () => {
        if (finished || stream.closed || stream.aborted) {
          cleanup();
          return;
        }

        try {
          await stream.write(": heartbeat\n\n");
        } catch {
          cleanup();
        }
      };
      const finish = async () => {
        cleanup();
        if (stream.closed || stream.aborted) {
          return;
        }

        try {
          await stream.close();
        } catch {
          // The stream may close between scheduling and flushing the final write.
        }
      };
      const subscriber = (event: SseEvent) => {
        void queueWrite(async () => {
          if ((await writeEvent(event)) && event.kind === "outcome") {
            await finish();
          }
        });
      };
      heartbeat = setInterval(() => {
        void queueWrite(writeHeartbeat);
      }, SSE_HEARTBEAT_MS);

      stream.onAbort(() => {
        cleanup();
      });
      handle.subscribers.add(subscriber);

      await done;
    });
  });

  router.get("/runs/:id", (context) => {
    const runId = context.req.param("id");
    const meta = deps.queries.getRunMeta(runId);
    if (meta === null) {
      return respondError(context, "run_not_found", 404, "Run not found");
    }

    return context.json(meta, 200);
  });

  router.get("/runs/:id/shots", (context) => {
    const runId = context.req.param("id");
    const meta = deps.queries.getRunMeta(runId);
    if (meta === null) {
      return respondError(context, "run_not_found", 404, "Run not found");
    }

    return context.json({ runId, shots: deps.queries.listShots(runId) }, 200);
  });

  router.post("/runs", async (context) => {
    context.header("Cache-Control", "no-store");

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return respondError(context, "invalid_input", 400, "Invalid input");
    }

    if (!isObjectRecord(body)) {
      return respondError(context, "invalid_input", 400, "Invalid input");
    }

    const providerId = readRequiredString(body, "providerId");
    if (providerId === null) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "providerId",
      });
    }

    const provider = deps.providers.get(providerId);
    if (provider === undefined) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "providerId",
      });
    }

    const modelId = readRequiredString(body, "modelId");
    if (modelId === null) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "modelId",
      });
    }

    if (!provider.models.some((model) => model.id === modelId)) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "modelId",
      });
    }

    const apiKey = readRequiredString(body, "apiKey");
    if (apiKey === null) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "apiKey",
      });
    }

    const budgetUsd = readOptionalBudgetUsd(body);
    if (budgetUsd === null) {
      return respondError(context, "invalid_input", 400, "Invalid input", {
        field: "budgetUsd",
      });
    }

    const clientSession = readSession(context);
    const runId = deps.manager.start({
      providerId,
      modelId,
      apiKey,
      clientSession,
      seedDate: new Date().toISOString().slice(0, 10),
      ...(budgetUsd === undefined ? {} : { budgetUsd }),
    });

    return context.json({ runId }, 200);
  });

  router.post("/runs/:id/abort", async (context) => {
    context.header("Cache-Control", "no-store");

    const runId = context.req.param("id");
    const meta = deps.queries.getRunMeta(runId);
    if (meta === null) {
      return respondError(context, "run_not_found", 404, "Run not found");
    }

    if (meta.outcome !== null) {
      return context.json({ outcome: meta.outcome }, 200);
    }

    if (!deps.manager.abort(runId, "viewer")) {
      return context.json({ outcome: deps.queries.getRunMeta(runId)?.outcome ?? null }, 200);
    }

    const handle = deps.manager.getHandle(runId);
    if (handle === null) {
      return context.json({ outcome: deps.queries.getRunMeta(runId)?.outcome ?? null }, 200);
    }

    return context.json({ outcome: await handle.taskPromise }, 200);
  });

  return router;
}
