import { describe, expect, test } from "bun:test";

import { isOutcome, OUTCOMES, type Outcome } from "../src/outcome.ts";

describe("Outcome contract", () => {
  test("exports provider_rate_limited as a terminal outcome", () => {
    expect(OUTCOMES).toContain("provider_rate_limited");

    const outcome: Outcome = "provider_rate_limited";
    expect(isOutcome(outcome)).toBe(true);
  });

  test("rejects non-outcome values", () => {
    expect(isOutcome("rate_limited")).toBe(false);
    expect(isOutcome(null)).toBe(false);
  });
});
