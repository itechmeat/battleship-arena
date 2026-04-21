const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: bigint, length: number): string {
  let remainder = value;
  let output = "";

  for (let index = 0; index < length; index += 1) {
    output = ENCODING[Number(remainder % 32n)] + output;
    remainder /= 32n;
  }

  return output;
}

function randomBits(byteCount: number): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));

  return bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
}

export function generateUlid(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomness = encodeBase32(randomBits(10), 16);

  return `${timestamp}${randomness}`;
}
