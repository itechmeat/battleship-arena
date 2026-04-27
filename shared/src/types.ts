import type { Outcome } from "./outcome.ts";

export interface HealthResponse {
  status: "ok";
  version: string;
  commitSha: string;
  startedAt: number;
}

export interface Shot {
  row: number;
  col: number;
  reasoning?: string;
}

export type CellState = "unknown" | "miss" | "hit" | "sunk";

export interface BoardView {
  size: 10;
  cells: readonly CellState[];
}

export type ShotResult =
  | "hit"
  | "miss"
  | "sunk"
  | "schema_error"
  | "invalid_coordinate"
  | "timeout";

export type ReasoningMode = "optional" | "forced_on" | "forced_off";

export interface RunMeta {
  id: string;
  seedDate: string;
  providerId: string;
  modelId: string;
  displayName: string;
  reasoningEnabled: boolean;
  startedAt: number;
  endedAt: number | null;
  outcome: Outcome | null;
  shotsFired: number;
  hits: number;
  schemaErrors: number;
  invalidCoordinates: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  budgetUsdMicros: number | null;
  terminalErrorCode: string | null;
  terminalErrorStatus: number | null;
  terminalErrorMessage: string | null;
}

export interface RunShotRow {
  runId: string;
  idx: number;
  row: number | null;
  col: number | null;
  result: ShotResult;
  rawResponse: string;
  reasoningText: string | null;
  llmError: string | null;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number | null;
  costUsdMicros: number;
  durationMs: number;
  createdAt: number;
}

export interface StartRunInput {
  providerId: string;
  modelId: string;
  apiKey: string;
  reasoningEnabled: boolean;
  budgetUsd?: number;
  mockCostUsd?: number;
  clientSession: string;
  seedDate: string;
}

export type ProviderError =
  | { kind: "transient"; cause: string }
  | { kind: "rate_limited"; cause: string }
  | { kind: "unreachable"; cause: string; status: number };

export type ProviderErrorShape = ProviderError;

export interface ModelPricingView {
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
}

export interface ModelCostEstimate {
  minUsd: number;
  maxUsd: number;
}

export interface ProvidersResponseModel {
  id: string;
  displayName: string;
  hasReasoning: boolean;
  reasoningMode: ReasoningMode;
  pricing: ModelPricingView;
  estimatedPromptTokens: number;
  estimatedImageTokens: number;
  estimatedOutputTokensPerShot: number;
  estimatedCostRange: ModelCostEstimate;
  priceSource: string;
  lastReviewedAt: string;
}

export interface ProvidersResponseProvider {
  id: string;
  displayName: string;
  models: readonly ProvidersResponseModel[];
}

export interface ProvidersResponse {
  providers: readonly ProvidersResponseProvider[];
}

export type ProviderCatalogModel = ProvidersResponseModel;
export type ProviderCatalogProvider = ProvidersResponseProvider;

export type LeaderboardScope = "today" | "all";
export type LeaderboardPeriod = LeaderboardScope;

export interface LeaderboardRow {
  rank: number;
  providerId: string;
  modelId: string;
  displayName: string;
  reasoningEnabled: boolean;
  shotsToWin: number;
  runsCount: number;
  bestRunId: string | null;
}

export type LeaderboardEntry = LeaderboardRow;

export interface LeaderboardResponse {
  scope: LeaderboardScope;
  seedDate: string | null;
  rows: readonly LeaderboardRow[];
}
