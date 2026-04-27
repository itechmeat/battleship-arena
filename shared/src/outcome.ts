export const OUTCOMES = [
  "won",
  "dnf_shot_cap",
  "dnf_schema_errors",
  "dnf_budget",
  "llm_unreachable",
  "provider_rate_limited",
  "aborted_viewer",
  "aborted_server_restart",
] as const;

export type Outcome = (typeof OUTCOMES)[number];

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}
