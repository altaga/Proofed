import { createHash, randomBytes } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
}

export function newPickupCode(seed?: string): string {
  if (seed) {
    const digest = createHash("sha256").update(`proofed-pin-v1:${seed}`).digest();
    let out = "";
    for (let i = 0; i < 6; i += 1) {
      out += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
    }
    return out;
  }
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function newRequestId(): string {
  return randomBytes(16).toString("hex");
}
