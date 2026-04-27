export function resolveLiveRunIdFromPath(pathname: string): string {
  return pathname.split("/").filter(Boolean).at(-1) ?? "";
}

export function resolveReplayRunIdFromPath(pathname: string): string {
  const pathSegments = pathname.split("/").filter(Boolean);
  return pathSegments.at(-1) === "replay" ? (pathSegments.at(-2) ?? "") : "";
}
