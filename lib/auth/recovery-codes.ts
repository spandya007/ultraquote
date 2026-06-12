import { createHash, randomInt } from "crypto";

// MFA recovery codes (server-side). Supabase MFA doesn't provide these, so we
// generate high-entropy codes, show them once, and store only SHA-256 hashes.
// Codes are random/high-entropy, so a fast hash (SHA-256) is sufficient.

export const RECOVERY_CODE_COUNT = 10;

// Crockford-ish alphabet: no 0/O/1/I/L to avoid transcription mistakes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    let s = "";
    for (let j = 0; j < 10; j++) s += ALPHABET[randomInt(ALPHABET.length)];
    codes.push(`${s.slice(0, 5)}-${s.slice(5)}`); // e.g. ABCDE-FGHJK
  }
  return codes;
}

// Strip formatting + uppercase so user input matches regardless of dashes/case.
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
