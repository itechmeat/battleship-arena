import { describe, expect, test } from "bun:test";

import {
  isObjectRecord,
  isValidIsoDate,
  readLeaderboardScope,
  readOptionalBooleanQuery,
  readOptionalBudgetUsd,
  readOptionalMockCostUsd,
  readOptionalReasoningEnabled,
  readRequiredString,
} from "../../src/api/validation.ts";

describe("API validation helpers", () => {
  test("reads object records and required strings", () => {
    expect(isObjectRecord({ ok: true })).toBe(true);
    expect(isObjectRecord(null)).toBe(false);
    expect(isObjectRecord([])).toBe(false);
    expect(readRequiredString({ providerId: " openrouter " }, "providerId")).toBe("openrouter");
    expect(readRequiredString({ providerId: "" }, "providerId")).toBeNull();
  });

  test("reads optional run body values", () => {
    expect(readOptionalBudgetUsd({})).toBeUndefined();
    expect(readOptionalBudgetUsd({ budgetUsd: 0 })).toBeUndefined();
    expect(readOptionalBudgetUsd({ budgetUsd: 0.5 })).toBe(0.5);
    expect(readOptionalBudgetUsd({ budgetUsd: -1 })).toBeNull();

    expect(readOptionalMockCostUsd({ mockCost: 0 })).toBe(0);
    expect(readOptionalMockCostUsd({ mockCost: -1 })).toBeNull();

    expect(readOptionalReasoningEnabled({ reasoningEnabled: false })).toBe(false);
    expect(readOptionalReasoningEnabled({ reasoningEnabled: "false" })).toBeNull();
  });

  test("reads query booleans, leaderboard scope, and ISO dates", () => {
    expect(readOptionalBooleanQuery(undefined)).toBeUndefined();
    expect(readOptionalBooleanQuery("true")).toBe(true);
    expect(readOptionalBooleanQuery("false")).toBe(false);
    expect(readOptionalBooleanQuery("yes")).toBeNull();

    expect(readLeaderboardScope("today")).toBe("today");
    expect(readLeaderboardScope("all")).toBe("all");
    expect(readLeaderboardScope("week")).toBeNull();

    expect(isValidIsoDate("2026-04-21")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("04-21-2026")).toBe(false);
  });
});
