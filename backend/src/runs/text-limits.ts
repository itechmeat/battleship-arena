export const RAW_RESPONSE_LIMIT = 8 * 1024;
export const REASONING_TEXT_LIMIT = 2 * 1024;

const textEncoder = new TextEncoder();

export function truncateText(text: string, limit: number): string {
  if (limit <= 0) {
    return "";
  }

  if (textEncoder.encode(text).byteLength <= limit) {
    return text;
  }

  const codePoints = Array.from(text);
  let low = 0;
  let high = codePoints.length;
  let best = 0;

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = codePoints.slice(0, midpoint).join("");
    if (textEncoder.encode(candidate).byteLength <= limit) {
      best = midpoint;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  return codePoints.slice(0, best).join("");
}
