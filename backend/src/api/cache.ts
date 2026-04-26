import { createHash } from "node:crypto";

export function weakJsonEtag(value: unknown): string {
  const serialized = JSON.stringify(value) ?? "null";
  return `W/"${createHash("sha256").update(serialized).digest("hex").slice(0, 16)}"`;
}

export function stableEtag(value: string): string {
  return `"${createHash("sha256").update(value).digest("hex").slice(0, 16)}"`;
}
