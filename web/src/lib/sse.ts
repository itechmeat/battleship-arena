import { isSseEvent, type SseEvent } from "@battleship-arena/shared";

export interface SubscribeToRunOptions {
  lastEventId: number | null;
  onEvent: (event: Exclude<SseEvent, { kind: "resync" }>) => void;
  onResync: () => void;
  onError: (error: unknown) => void;
}

export function subscribeToRun(runId: string, options: SubscribeToRunOptions): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let currentLastEventId = options.lastEventId;

  const handlePayload = (rawEvent: Event) => {
    if (!(rawEvent instanceof MessageEvent) || typeof rawEvent.data !== "string") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawEvent.data);
    } catch {
      options.onError(new Error("Invalid SSE payload"));
      return;
    }

    if (!isSseEvent(parsed)) {
      options.onError(new Error("Unexpected SSE event shape"));
      return;
    }

    if (parsed.kind === "resync") {
      options.onResync();
      return;
    }

    currentLastEventId = parsed.id;
    options.onEvent(parsed);
  };

  const connect = () => {
    if (closed) {
      return;
    }

    const url = new URL(`/api/runs/${encodeURIComponent(runId)}/events`, window.location.origin);
    if (currentLastEventId !== null) {
      url.searchParams.set("lastEventId", String(currentLastEventId));
    }

    source = new EventSource(url.toString());
    source.addEventListener("shot", handlePayload);
    source.addEventListener("outcome", handlePayload);
    source.addEventListener("resync", handlePayload);
    source.onerror = () => {
      if (closed) {
        return;
      }

      if (source !== null && source.readyState === EventSource.CLOSED) {
        source.close();
        connect();
      }
    };
  };

  connect();

  return () => {
    closed = true;
    source?.close();
  };
}
