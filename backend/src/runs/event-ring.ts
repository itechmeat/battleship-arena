import type { SseEvent } from "@battleship-arena/shared";

export class EventRing {
  private readonly events: SseEvent[] = [];
  private nextId = 1;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error("EventRing capacity must be positive");
    }
  }

  push(event: SseEvent): SseEvent {
    const stored: SseEvent = { ...event, id: this.nextId };
    this.nextId += 1;
    this.events.push(stored);

    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }

    return stored;
  }

  since(lastEventId: number | null): SseEvent[] | "out_of_range" {
    if (lastEventId === null) {
      return [...this.events];
    }

    if (this.events.length === 0) {
      return [];
    }

    const oldestId = this.events[0]?.id;
    if (oldestId !== undefined && lastEventId < oldestId - 1) {
      return "out_of_range";
    }

    return this.events.filter((event) => event.id > lastEventId);
  }
}
