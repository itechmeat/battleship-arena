import { SSE_HEARTBEAT_MS, type SseEvent } from "@battleship-arena/shared";

import type { Queries } from "../db/queries.ts";
import type { RunHandle } from "../runs/manager.ts";

const LIVE_RESUME_EVENT_ID_OFFSET = 2;

export interface SsePayload {
  event: string;
  id: string;
  data: string;
}

export interface SseStreamWriter {
  readonly closed: boolean;
  readonly aborted: boolean;
  writeSSE(payload: SsePayload): Promise<void>;
  write(chunk: string): Promise<unknown>;
  close(): Promise<void>;
  onAbort(callback: () => void): void;
}

export function parseLastEventId(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveLiveResumeEventId(input: {
  headerLastEventId: string | null | undefined;
  queryLastEventId: string | null | undefined;
}): number | null {
  const headerLastEventId = parseLastEventId(input.headerLastEventId);
  const queryLastShotIndex = parseLastEventId(input.queryLastEventId);

  return (
    headerLastEventId ??
    (queryLastShotIndex === null ? null : queryLastShotIndex + LIVE_RESUME_EVENT_ID_OFFSET)
  );
}

export function toSseEventData(event: SseEvent): SsePayload {
  return {
    event: event.kind,
    id: String(event.id),
    data: JSON.stringify(event),
  };
}

export function synthesizeTerminalReplay(queries: Queries, runId: string): SseEvent[] | null {
  const meta = queries.getRunMeta(runId);
  if (meta === null || meta.outcome === null) {
    return null;
  }

  const shots = queries.listShots(runId);

  return [
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
      tokensIn: shot.tokensIn,
      tokensOut: shot.tokensOut,
      reasoningTokens: shot.reasoningTokens,
      costUsdMicros: shot.costUsdMicros,
      durationMs: shot.durationMs,
      createdAt: shot.createdAt,
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
}

export async function streamEventsAndClose(
  stream: SseStreamWriter,
  events: readonly SseEvent[],
): Promise<void> {
  for (const event of events) {
    await stream.writeSSE(toSseEventData(event));
  }

  await stream.close();
}

export async function streamResyncAndClose(stream: SseStreamWriter): Promise<void> {
  await stream.writeSSE(
    toSseEventData({
      kind: "resync",
      id: 0,
    }),
  );
  await stream.close();
}

export async function streamLiveRunEvents(
  stream: SseStreamWriter,
  handle: RunHandle,
  lastEventId: number | null,
): Promise<void> {
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
  let replayComplete = false;
  const bufferedLiveEvents: SseEvent[] = [];
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
    if (!replayComplete) {
      bufferedLiveEvents.push(event);
      return;
    }

    void queueWrite(async () => {
      if ((await writeEvent(event)) && event.kind === "outcome") {
        await finish();
      }
    });
  };

  stream.onAbort(() => {
    cleanup();
  });
  handle.subscribers.add(subscriber);

  const backlog = handle.ring.since(lastEventId);

  if (backlog === "out_of_range") {
    await streamResyncAndClose(stream);
    cleanup();
    return;
  }

  const replayCutoffEventId = backlog.at(-1)?.id ?? lastEventId ?? 0;
  for (const event of backlog) {
    if (!(await writeEvent(event))) {
      await done;
      return;
    }

    if (event.kind === "outcome") {
      await finish();
      await done;
      return;
    }
  }

  replayComplete = true;
  for (const event of bufferedLiveEvents.splice(0)) {
    if (event.id <= replayCutoffEventId) {
      continue;
    }

    subscriber(event);
  }

  heartbeat = setInterval(() => {
    void queueWrite(writeHeartbeat);
  }, SSE_HEARTBEAT_MS);

  await done;
}
