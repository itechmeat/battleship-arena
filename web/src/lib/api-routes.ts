import type { LeaderboardScope } from "@battleship-arena/shared";

export interface LeaderboardRouteOptions {
  providerId?: string;
  modelId?: string;
  reasoningEnabled?: boolean;
}

export function providersPath(): string {
  return "/api/providers";
}

export function runsPath(): string {
  return "/api/runs";
}

export function runPath(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}`;
}

export function runShotsPath(runId: string): string {
  return `${runPath(runId)}/shots`;
}

export function abortRunPath(runId: string): string {
  return `${runPath(runId)}/abort`;
}

export function runEventsPath(runId: string, lastEventId: number | null): string {
  const path = `${runPath(runId)}/events`;
  const search = new URLSearchParams();
  if (lastEventId !== null) {
    search.set("lastEventId", String(lastEventId));
  }

  const query = search.toString();
  return query.length === 0 ? path : `${path}?${query}`;
}

export function leaderboardPath(
  scope: LeaderboardScope = "today",
  options: LeaderboardRouteOptions = {},
): string {
  const search = new URLSearchParams({ scope });
  if (options.providerId !== undefined && options.providerId.length > 0) {
    search.set("providerId", options.providerId);
  }
  if (options.modelId !== undefined && options.modelId.length > 0) {
    search.set("modelId", options.modelId);
  }
  if (options.reasoningEnabled !== undefined) {
    search.set("reasoningEnabled", String(options.reasoningEnabled));
  }

  return `/api/leaderboard?${search.toString()}`;
}
