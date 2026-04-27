import type { LeaderboardScope } from "@battleship-arena/shared";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readOptionalBudgetUsd(body: Record<string, unknown>): number | undefined | null {
  const value = body.budgetUsd;
  if (value === undefined || value === null || value === 0) {
    return undefined;
  }

  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function readOptionalMockCostUsd(body: Record<string, unknown>): number | undefined | null {
  const value = body.mockCost;
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function readOptionalReasoningEnabled(
  body: Record<string, unknown>,
): boolean | undefined | null {
  const value = body.reasoningEnabled;
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === "boolean" ? value : null;
}

export function readOptionalBooleanQuery(value: string | undefined): boolean | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

export function readLeaderboardScope(value: string | undefined): LeaderboardScope | null {
  if (value === "today" || value === "all") {
    return value;
  }

  return null;
}

export function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
