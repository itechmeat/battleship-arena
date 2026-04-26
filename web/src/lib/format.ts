export function formatUsd(valueUsd: number): string {
  if (!Number.isFinite(valueUsd) || valueUsd <= 0) {
    return "$0";
  }

  if (valueUsd < 0.001) {
    return "<$0.001";
  }

  return `$${valueUsd.toFixed(3)}`;
}

export function formatUsdMicros(costUsdMicros: number): string {
  return formatUsd(costUsdMicros / 1_000_000);
}
