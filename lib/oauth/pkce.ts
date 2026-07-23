import crypto from "crypto";

// PKCE (RFC 7636). We require S256 — the only method advertised in the AS
// metadata. challenge = base64url( sha256(code_verifier) ).

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function s256Challenge(codeVerifier: string): string {
  return base64url(crypto.createHash("sha256").update(codeVerifier).digest());
}

export function verifyPkce(codeVerifier: string, codeChallenge: string, method = "S256"): boolean {
  if (method !== "S256") return false;
  if (!codeVerifier || codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  // Constant-time compare of equal-length strings.
  const a = Buffer.from(s256Challenge(codeVerifier));
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
