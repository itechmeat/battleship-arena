import {
  RING_CAPACITY,
  type Outcome,
  type SseEvent,
  type StartRunInput,
} from "@battleship-arena/shared";

import { generateUlid } from "../db/ulid.ts";
import type { Queries } from "../db/queries.ts";
import type { ProviderAdapter, ProviderRegistry } from "../providers/types.ts";

import { EventRing } from "./event-ring.ts";
import { runEngine } from "./engine.ts";

type AbortReason = "viewer" | "server_restart";

type Subscriber = (event: SseEvent) => void;

interface ManagerEntry {
  handle: RunHandle;
  settled: boolean;
}

export interface RunHandle {
  controller: AbortController;
  ring: EventRing;
  subscribers: Set<Subscriber>;
  taskPromise: Promise<Outcome | null>;
}

export interface Manager {
  start(input: StartRunInput): string;
  abort(runId: string, reason: AbortReason): boolean;
  getHandle(runId: string): RunHandle | null;
  shutdown(graceMs: number): Promise<void>;
}

export interface ManagerDeps {
  queries: Queries;
  providers: ProviderRegistry;
  now?: () => number;
}

function resolveProvider(deps: ManagerDeps, providerId: string): ProviderAdapter {
  const provider = deps.providers.get(providerId);
  if (provider === undefined) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  return provider;
}

function notifySubscribers(subscribers: ReadonlySet<Subscriber>, event: SseEvent) {
  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // Subscriber failures must not break the run lifecycle.
    }
  }
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createManager(deps: ManagerDeps): Manager {
  const entries = new Map<string, ManagerEntry>();
  const now = deps.now ?? Date.now;

  const pendingEntries = () => [...entries.values()].filter((entry) => !entry.settled);

  return {
    start(input) {
      const runId = generateUlid(now());
      const provider = resolveProvider(deps, input.providerId);
      const controller = new AbortController();
      const ring = new EventRing(RING_CAPACITY);
      const subscribers = new Set<Subscriber>();
      let entry: ManagerEntry;

      const taskPromise = runEngine(
        runId,
        input,
        controller.signal,
        (event) => {
          const storedEvent = ring.push(event);
          notifySubscribers(subscribers, storedEvent);
        },
        { queries: deps.queries, provider, now },
      ).finally(() => {
        entry.settled = true;
        entries.delete(runId);
      });

      const handle: RunHandle = {
        controller,
        ring,
        subscribers,
        taskPromise,
      };

      entry = {
        handle,
        settled: false,
      };

      entries.set(runId, entry);
      return runId;
    },

    abort(runId, reason) {
      const entry = entries.get(runId);
      if (entry === undefined || entry.settled) {
        return false;
      }

      if (!entry.handle.controller.signal.aborted) {
        entry.handle.controller.abort({ reason });
      }

      return true;
    },

    getHandle(runId) {
      return entries.get(runId)?.handle ?? null;
    },

    async shutdown(graceMs) {
      let pending = pendingEntries();
      if (pending.length === 0) {
        return;
      }

      if (graceMs > 0) {
        await Promise.race([
          Promise.allSettled(pending.map((entry) => entry.handle.taskPromise)).then(
            () => undefined,
          ),
          delay(graceMs),
        ]);
      }

      pending = pendingEntries();
      for (const entry of pending) {
        if (!entry.handle.controller.signal.aborted) {
          entry.handle.controller.abort({ reason: "server_restart" });
        }
      }

      await Promise.allSettled(pending.map((entry) => entry.handle.taskPromise));
    },
  };
}
