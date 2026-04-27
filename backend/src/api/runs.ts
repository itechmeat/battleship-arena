import { DEFAULT_BENCHMARK_SEED_DATE } from "@battleship-arena/shared";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { Queries } from "../db/queries.ts";
import type { Manager } from "../runs/manager.ts";
import type { ProviderRegistry } from "../providers/types.ts";

import {
  outcomeResponse,
  respondInvalidInput,
  respondRunNotFound,
  runShotsResponse,
} from "./responses.ts";
import {
  resolveLiveResumeEventId,
  streamEventsAndClose,
  streamLiveRunEvents,
  streamResyncAndClose,
  synthesizeTerminalReplay,
} from "./run-events.ts";
import { readSession } from "./session.ts";
import {
  isObjectRecord,
  readOptionalBudgetUsd,
  readOptionalMockCostUsd,
  readOptionalReasoningEnabled,
  readRequiredString,
} from "./validation.ts";

export interface RunsRouterDeps {
  manager: Pick<Manager, "start" | "abort" | "getHandle" | "shutdown">;
  queries: Queries;
  providers: ProviderRegistry;
}

export function createRunsRouter(deps: RunsRouterDeps) {
  const router = new Hono();

  router.get("/runs/:id/events", (context) => {
    context.header("Cache-Control", "no-store");

    const runId = context.req.param("id");
    const terminalReplay = synthesizeTerminalReplay(deps.queries, runId);
    if (terminalReplay !== null) {
      return streamSSE(context, async (stream) => {
        await streamEventsAndClose(stream, terminalReplay);
      });
    }

    const handle = deps.manager.getHandle(runId);
    if (handle === null) {
      return streamSSE(context, async (stream) => {
        await streamResyncAndClose(stream);
      });
    }

    return streamSSE(context, async (stream) => {
      const lastEventId = resolveLiveResumeEventId({
        headerLastEventId: context.req.header("Last-Event-ID"),
        queryLastEventId: context.req.query("lastEventId"),
      });
      await streamLiveRunEvents(stream, handle, lastEventId);
    });
  });

  router.get("/runs/:id", (context) => {
    const runId = context.req.param("id");
    const meta = deps.queries.getRunMeta(runId);
    if (meta === null) {
      return respondRunNotFound(context);
    }

    return context.json(meta, 200);
  });

  router.get("/runs/:id/shots", (context) => {
    const runId = context.req.param("id");
    const meta = deps.queries.getRunMeta(runId);
    if (meta === null) {
      return respondRunNotFound(context);
    }

    return context.json(runShotsResponse(runId, deps.queries.listShots(runId)), 200);
  });

  router.post("/runs", async (context) => {
    context.header("Cache-Control", "no-store");

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return respondInvalidInput(context);
    }

    if (!isObjectRecord(body)) {
      return respondInvalidInput(context);
    }

    const providerId = readRequiredString(body, "providerId");
    if (providerId === null) {
      return respondInvalidInput(context, {
        field: "providerId",
      });
    }

    const provider = deps.providers.get(providerId);
    if (provider === undefined) {
      return respondInvalidInput(context, {
        field: "providerId",
      });
    }

    const modelId = readRequiredString(body, "modelId");
    if (modelId === null) {
      return respondInvalidInput(context, {
        field: "modelId",
      });
    }

    const model = provider.models.find((candidate) => candidate.id === modelId);
    if (model === undefined) {
      return respondInvalidInput(context, {
        field: "modelId",
      });
    }

    const requestedReasoningEnabled = readOptionalReasoningEnabled(body);
    if (requestedReasoningEnabled === null) {
      return respondInvalidInput(context, {
        field: "reasoningEnabled",
      });
    }

    const reasoningEnabled =
      model.reasoningMode === "forced_on"
        ? true
        : model.reasoningMode === "forced_off"
          ? false
          : (requestedReasoningEnabled ?? true);

    const apiKey = readRequiredString(body, "apiKey");
    if (apiKey === null) {
      return respondInvalidInput(context, {
        field: "apiKey",
      });
    }

    const budgetUsd = readOptionalBudgetUsd(body);
    if (budgetUsd === null) {
      return respondInvalidInput(context, {
        field: "budgetUsd",
      });
    }

    const mockCostUsd = readOptionalMockCostUsd(body);
    if (mockCostUsd === null) {
      return respondInvalidInput(context, {
        field: "mockCost",
      });
    }

    const canUseMockCost = providerId === "mock" && process.env.NODE_ENV !== "production";

    const clientSession = readSession(context);
    const runId = deps.manager.start({
      providerId,
      modelId,
      apiKey,
      reasoningEnabled,
      clientSession,
      seedDate: DEFAULT_BENCHMARK_SEED_DATE,
      ...(budgetUsd === undefined ? {} : { budgetUsd }),
      ...(mockCostUsd === undefined || !canUseMockCost ? {} : { mockCostUsd }),
    });

    return context.json({ runId }, 200);
  });

  router.post("/runs/:id/abort", async (context) => {
    context.header("Cache-Control", "no-store");

    const runId = context.req.param("id");
    const meta = deps.queries.getRunMeta(runId);
    if (meta === null) {
      return respondRunNotFound(context);
    }

    if (meta.outcome !== null) {
      return context.json(outcomeResponse(meta.outcome), 200);
    }

    if (!deps.manager.abort(runId, "viewer")) {
      return context.json(outcomeResponse(deps.queries.getRunMeta(runId)?.outcome ?? null), 200);
    }

    const handle = deps.manager.getHandle(runId);
    if (handle === null) {
      return context.json(outcomeResponse(deps.queries.getRunMeta(runId)?.outcome ?? null), 200);
    }

    return context.json(outcomeResponse(await handle.taskPromise), 200);
  });

  return router;
}
