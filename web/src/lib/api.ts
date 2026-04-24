import type {
  ErrorEnvelope,
  LeaderboardResponse,
  LeaderboardScope,
  Outcome,
  ProvidersResponse,
  RunMeta,
  RunShotRow,
} from "@battleship-arena/shared";

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
  return request<StartRunResponse>("/api/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function getProviders(signal?: AbortSignal): Promise<ProvidersResponse> {
  return request<ProvidersResponse>(
    "/api/providers",
    signal === undefined ? undefined : { signal },
  );
}

export interface GetLeaderboardOptions {
  providerId?: string;
  modelId?: string;
  signal?: AbortSignal;
}

export function getLeaderboard(
  scope: LeaderboardScope = "today",
  options: GetLeaderboardOptions = {},
): Promise<LeaderboardResponse> {
  const search = new URLSearchParams({ scope });
  if (options.providerId !== undefined && options.providerId.length > 0) {
    search.set("providerId", options.providerId);
  }
  if (options.modelId !== undefined && options.modelId.length > 0) {
    search.set("modelId", options.modelId);
  }

  return request<LeaderboardResponse>(
    `/api/leaderboard?${search.toString()}`,
    options.signal === undefined ? undefined : { signal: options.signal },
  );
}

export function getRun(runId: string, signal?: AbortSignal): Promise<RunMeta> {
  return request<RunMeta>(
    `/api/runs/${encodeURIComponent(runId)}`,
    signal === undefined ? undefined : { signal },
  );
}

export function getRunShots(runId: string, signal?: AbortSignal): Promise<RunShotsResponse> {
  return request<RunShotsResponse>(
    `/api/runs/${encodeURIComponent(runId)}/shots`,
    signal === undefined ? undefined : { signal },
  );
}

export function abortRun(runId: string): Promise<AbortRunResponse> {
  return request<AbortRunResponse>(`/api/runs/${encodeURIComponent(runId)}/abort`, {
    method: "POST",
  });
}
