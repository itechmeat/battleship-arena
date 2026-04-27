import { describe, expect, test } from "bun:test";

import type { Queries } from "../../src/db/queries.ts";
import {
  parseLastEventId,
  resolveLiveResumeEventId,
  streamLiveRunEvents,
  synthesizeTerminalReplay,
  toSseEventData,
  type SsePayload,
  type SseStreamWriter,
} from "../../src/api/run-events.ts";
import { EventRing } from "../../src/runs/event-ring.ts";
import type { RunHandle } from "../../src/runs/manager.ts";

function createStreamWriter(): SseStreamWriter & {
  readonly payloads: SsePayload[];
} {
  const payloads: SsePayload[] = [];
  let closed = false;
  let aborted = false;

  return {
    payloads,
    get closed() {
      return closed;
    },
    get aborted() {
      return aborted;
    },
    async writeSSE(payload) {
      payloads.push(payload);
    },
    async write() {},
    async close() {
      closed = true;
    },
    onAbort() {},
  };
}

function queries(): Queries {
  return {
    insertRun() {},
    appendShot() {},
    finalizeRun() {},
    getRunMeta(id) {
      return {
        id,
        seedDate: "2026-04-21",
        providerId: "mock",
        modelId: "mock-happy",
        displayName: "Mock happy",
        reasoningEnabled: true,
        startedAt: 100,
        endedAt: 200,
        outcome: "won",
        shotsFired: 1,
        hits: 1,
        schemaErrors: 0,
        invalidCoordinates: 0,
        durationMs: 100,
        tokensIn: 10,
        tokensOut: 5,
        reasoningTokens: null,
        costUsdMicros: 0,
        budgetUsdMicros: null,
        terminalErrorCode: null,
        terminalErrorStatus: null,
        terminalErrorMessage: null,
      };
    },
    listShots(runId) {
      return [
        {
          runId,
          idx: 0,
          row: 0,
          col: 0,
          result: "hit",
          rawResponse: "{}",
          reasoningText: "reason",
          llmError: null,
          tokensIn: 10,
          tokensOut: 5,
          reasoningTokens: null,
          costUsdMicros: 0,
          durationMs: 50,
          createdAt: 150,
        },
      ];
    },
    getLeaderboard() {
      return { scope: "today", seedDate: "2026-04-21", rows: [] };
    },
    findStuckRunIds() {
      return [];
    },
    markStuckRunsAborted() {
      return 0;
    },
  };
}

describe("run SSE event helpers", () => {
  test("parses and resolves live resume event ids", () => {
    expect(parseLastEventId(undefined)).toBeNull();
    expect(parseLastEventId("  ")).toBeNull();
    expect(parseLastEventId("12")).toBe(12);
    expect(parseLastEventId("not-number")).toBeNull();

    expect(
      resolveLiveResumeEventId({
        headerLastEventId: "9",
        queryLastEventId: "2",
      }),
    ).toBe(9);
    expect(
      resolveLiveResumeEventId({
        headerLastEventId: undefined,
        queryLastEventId: "2",
      }),
    ).toBe(4);
  });

  test("formats SSE payloads and terminal replay events", () => {
    expect(toSseEventData({ kind: "resync", id: 0 })).toEqual({
      event: "resync",
      id: "0",
      data: JSON.stringify({ kind: "resync", id: 0 }),
    });

    const replay = synthesizeTerminalReplay(queries(), "run-1");

    expect(replay?.map((event) => event.kind)).toEqual(["open", "shot", "outcome"]);
    expect(replay?.[1]).toEqual(
      expect.objectContaining({
        kind: "shot",
        idx: 0,
        row: 0,
        col: 0,
        result: "hit",
      }),
    );
  });

  test("subscribes before replaying backlog so live events are not lost", async () => {
    const ring = new EventRing(10);
    const subscribers = new Set<(event: ReturnType<EventRing["push"]>) => void>();
    const openEvent = ring.push({
      kind: "open",
      id: 0,
      runId: "run-1",
      startedAt: 100,
      seedDate: "2026-04-21",
    });
    const originalSince = ring.since.bind(ring);
    ring.since = ((lastEventId) => {
      const backlog = originalSince(lastEventId);
      const raceEvent = ring.push({
        kind: "shot",
        id: 0,
        idx: 0,
        row: 0,
        col: 0,
        result: "miss",
        reasoning: null,
        tokensIn: 0,
        tokensOut: 0,
        reasoningTokens: null,
        costUsdMicros: 0,
        durationMs: 1,
        createdAt: 150,
      });
      for (const subscriber of subscribers) {
        subscriber(raceEvent);
      }

      return backlog;
    }) as EventRing["since"];
    const handle: RunHandle = {
      controller: new AbortController(),
      ring,
      subscribers,
      taskPromise: Promise.resolve(null),
    };
    const stream = createStreamWriter();
    const streaming = streamLiveRunEvents(stream, handle, null);
    await Promise.resolve();

    const outcomeEvent = ring.push({
      kind: "outcome",
      id: 0,
      outcome: "dnf_shot_cap",
      shotsFired: 1,
      hits: 0,
      schemaErrors: 0,
      invalidCoordinates: 0,
      endedAt: 200,
    });
    for (const subscriber of subscribers) {
      subscriber(outcomeEvent);
    }

    await streaming;

    expect(stream.payloads.map((payload) => JSON.parse(payload.data).kind)).toEqual([
      openEvent.kind,
      "shot",
      "outcome",
    ]);
  });
});
