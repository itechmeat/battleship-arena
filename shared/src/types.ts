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
