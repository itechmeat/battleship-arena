export function encodePngDataUrl(boardPng: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(boardPng).toString("base64")}`;
}
