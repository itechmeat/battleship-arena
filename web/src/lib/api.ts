import type {
  ErrorEnvelope,
  LeaderboardResponse,
  LeaderboardScope,
  Outcome,
  ProvidersResponse,
  RunMeta,
  RunShotRow,
} from "@battleship-arena/shared";

import {
  abortRunPath,
  leaderboardPath,
  providersPath,
  runPath,
  runsPath,
  runShotsPath,
} from "./api-routes.ts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly envelope: ErrorEnvelope,
  ) {
    super(envelope.error.message);
    this.name = "ApiError";
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    isObjectRecord(value) &&
    isObjectRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
  });

  if (!response.ok) {
    let envelope: ErrorEnvelope = {
      error: {
        code: "internal",
        message: `Request failed with status ${response.status}`,
      },
    };

    try {
      const parsed: unknown = await response.json();
      if (isErrorEnvelope(parsed)) {
        envelope = parsed;
      }
    } catch {
      // Ignore malformed error bodies and fall back to a synthetic envelope.
    }

    throw new ApiError(response.status, envelope);
  }

  return (await response.json()) as T;
}

export interface StartRunPayload {
  providerId: string;
  modelId: string;
  apiKey: string;
  reasoningEnabled: boolean;
  budgetUsd?: number;
  mockCost?: number;
}

export interface StartRunResponse {
  runId: string;
}

export interface RunShotsResponse {
  runId: string;
  shots: RunShotRow[];
}

export interface AbortRunResponse {
  outcome: Outcome | null;
}

export function startRun(payload: StartRunPayload): Promise<StartRunResponse> {
  return request<StartRunResponse>(runsPath(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function getProviders(signal?: AbortSignal): Promise<ProvidersResponse> {
  return request<ProvidersResponse>(providersPath(), signal === undefined ? undefined : { signal });
}

export interface GetLeaderboardOptions {
  providerId?: string;
  modelId?: string;
  reasoningEnabled?: boolean;
  signal?: AbortSignal;
}

export function getLeaderboard(
  scope: LeaderboardScope = "today",
  options: GetLeaderboardOptions = {},
): Promise<LeaderboardResponse> {
  const { signal, ...routeOptions } = options;
  return request<LeaderboardResponse>(
    leaderboardPath(scope, routeOptions),
    signal === undefined ? undefined : { signal },
  );
}

export function getRun(runId: string, signal?: AbortSignal): Promise<RunMeta> {
  return request<RunMeta>(runPath(runId), signal === undefined ? undefined : { signal });
}

export function getRunShots(runId: string, signal?: AbortSignal): Promise<RunShotsResponse> {
  return request<RunShotsResponse>(
    runShotsPath(runId),
    signal === undefined ? undefined : { signal },
  );
}

export function abortRun(runId: string): Promise<AbortRunResponse> {
  return request<AbortRunResponse>(abortRunPath(runId), {
    method: "POST",
  });
}
