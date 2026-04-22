import { describe, expect, test } from "bun:test";

import {
  MOCK_TURN_DELAY_MS_DEFAULT,
  RING_CAPACITY,
  SCHEMA_ERROR_DNF_THRESHOLD,
  SSE_HEARTBEAT_MS,
} from "../src/constants.ts";

describe("S2a constants", () => {
  test("ring capacity is 200", () => {
    expect(RING_CAPACITY).toBe(200);
  });

  test("sse heartbeat is 25 seconds", () => {
    expect(SSE_HEARTBEAT_MS).toBe(25_000);
  });

  test("schema-error threshold is 5", () => {
    expect(SCHEMA_ERROR_DNF_THRESHOLD).toBe(5);
  });

  test("mock turn delay default is 150", () => {
    expect(MOCK_TURN_DELAY_MS_DEFAULT).toBe(150);
  });
});
