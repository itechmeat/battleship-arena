export const ERROR_CODES = [
  "invalid_input",
  "not_found",
  "run_terminal",
  "provider_unavailable",
  "budget_required",
  "rate_limited",
  "maintenance_soft",
  "too_many_active_runs",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    detail?: Record<string, unknown>;
  };
}
