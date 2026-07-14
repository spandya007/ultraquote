import crypto from "node:crypto";

// Signed, short-lived OAuth `state` parameter (CSRF protection). HMAC-signed with
// INTEGRATIONS_ENC_KEY so a callback can't be forged; the callback ALSO re-checks
// the session user owns the tenant in the state. See docs/integrations-phase-a-plan.md (A3).

function secret(): string {
  const s = process.env.INTEGRATIONS_ENC_KEY;
  if (!s) throw new Error("INTEGRATIONS_ENC_KEY is not set");
  return s;
}

export function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState<T = Record<string, unknown>>(token: string, maxAgeMs = 600_000): T | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as { ts?: number };
    if (typeof data.ts !== "number" || Date.now() - data.ts > maxAgeMs) return null;
    return data as T;
  } catch {
    return null;
  }
}
