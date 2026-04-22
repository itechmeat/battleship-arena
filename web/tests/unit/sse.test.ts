import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { subscribeToRun } from "../../src/lib/sse.ts";

const originalEventSource = globalThis.EventSource;
const originalWindow = globalThis.window;

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, EventListener[]>();
  onerror: ((event: Event) => void) | null = null;
  readyState = FakeEventSource.OPEN;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

describe("subscribeToRun", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          origin: "https://arena.example",
        },
      },
    });
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  test("sends lastEventId as a query parameter", () => {
    const unsubscribe = subscribeToRun("run 1", {
      lastEventId: 7,
      onEvent() {},
      onResync() {},
      onError() {
        throw new Error("onError should not be called");
      },
    });

    expect(FakeEventSource.instances[0]?.url).toBe(
      "https://arena.example/api/runs/run%201/events?lastEventId=7",
    );
    expect(FakeEventSource.instances[0]?.listeners.has("open")).toBe(false);

    unsubscribe();
  });

  test("reconnects on CLOSED without surfacing a transient error", () => {
    let errorCount = 0;
    const unsubscribe = subscribeToRun("run-1", {
      lastEventId: null,
      onEvent() {},
      onResync() {},
      onError() {
        errorCount += 1;
      },
    });

    const source = FakeEventSource.instances[0];
    if (source === undefined || source.onerror === null) {
      throw new Error("Expected an active EventSource instance");
    }

    source.readyState = FakeEventSource.CONNECTING;
    source.onerror(new Event("error"));
    expect(errorCount).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(1);

    source.readyState = FakeEventSource.CLOSED;
    source.onerror(new Event("error"));
    expect(errorCount).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(2);

    unsubscribe();
  });
});
