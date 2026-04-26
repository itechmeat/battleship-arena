import { SSE_HEARTBEAT_MS } from "@battleship-arena/shared";

import { createApp } from "./app.ts";
import { loadConfigOrExit, type AppConfig } from "./config.ts";
import { openDatabase } from "./db/client.ts";
import { createQueries } from "./db/queries.ts";
import { createDefaultProviderRegistry } from "./providers/registry.ts";
import { createManager } from "./runs/manager.ts";
import { reconcileStuckRuns } from "./runs/reconcile.ts";

const STARTED_AT = Date.now();
const SERVER_IDLE_TIMEOUT_SEC = Math.min(
  255,
  Math.max(60, Math.ceil((SSE_HEARTBEAT_MS * 2) / 1000)),
);

interface RuntimeHandle {
  server: ReturnType<typeof Bun.serve>;
  sqlite: ReturnType<typeof openDatabase>["sqlite"];
  manager: ReturnType<typeof createManager>;
  shutdownGraceMs: number;
  shuttingDown: Promise<void> | null;
}

declare global {
  var __battleshipRuntime: RuntimeHandle | undefined;
  var __battleshipSignalsInstalled: boolean | undefined;
}

const runtimeState = globalThis as typeof globalThis & {
  __battleshipRuntime?: RuntimeHandle;
  __battleshipSignalsInstalled?: boolean;
};

function logShutdownError(
  step: "manager.shutdown" | "server.stop" | "sqlite.close",
  error: unknown,
) {
  console.error(`Graceful shutdown failed during ${step}`, error);
}

async function shutdownRuntime(runtime: RuntimeHandle | undefined, forceServerStop = false) {
  if (runtime === undefined) {
    return;
  }

  if (runtime.shuttingDown !== null) {
    await runtime.shuttingDown;
    return;
  }

  runtime.shuttingDown = (async () => {
    try {
      await runtime.manager.shutdown(runtime.shutdownGraceMs);
    } catch (error) {
      logShutdownError("manager.shutdown", error);
    } finally {
      try {
        await runtime.server.stop(forceServerStop);
      } catch (error) {
        logShutdownError("server.stop", error);
      }

      try {
        runtime.sqlite.close();
      } catch (error) {
        logShutdownError("sqlite.close", error);
      }

      if (runtimeState.__battleshipRuntime === runtime) {
        delete runtimeState.__battleshipRuntime;
      }
    }
  })();

  await runtime.shuttingDown;
}

function installSignalHandlers() {
  if (runtimeState.__battleshipSignalsInstalled === true) {
    return;
  }

  const handleSignal = (signal: "SIGTERM" | "SIGINT") => {
    shutdownRuntime(runtimeState.__battleshipRuntime).catch((error) => {
      console.error(`Unexpected ${signal} shutdown failure`, error);
    });
  };

  process.once("SIGTERM", () => {
    handleSignal("SIGTERM");
  });
  process.once("SIGINT", () => {
    handleSignal("SIGINT");
  });

  runtimeState.__battleshipSignalsInstalled = true;
}

export async function bootstrap(config: AppConfig) {
  await shutdownRuntime(runtimeState.__battleshipRuntime, true);

  const database = openDatabase(config.databasePath);
  const queries = createQueries(database.db);
  reconcileStuckRuns(queries, Date.now());

  const providers = createDefaultProviderRegistry({
    mockTurnDelayMs: config.mockTurnDelayMs,
    ...(process.env.NODE_ENV === undefined ? {} : { environment: process.env.NODE_ENV }),
  });
  const manager = createManager({
    queries,
    providers,
    now: () => Date.now(),
  });
  const app = createApp(
    {
      version: config.version,
      commitSha: config.commitSha,
      startedAt: STARTED_AT,
    },
    {
      queries,
      providers,
      manager,
    },
  );

  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
    idleTimeout: SERVER_IDLE_TIMEOUT_SEC,
  });

  runtimeState.__battleshipRuntime = {
    server,
    sqlite: database.sqlite,
    manager,
    shutdownGraceMs: config.shutdownGraceSec * 1000,
    shuttingDown: null,
  };
  installSignalHandlers();

  return {
    server,
    sqlite: database.sqlite,
    manager,
    config,
  };
}

if (import.meta.main) {
  await bootstrap(loadConfigOrExit(process.env));
}
