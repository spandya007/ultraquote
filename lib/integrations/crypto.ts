import crypto from "node:crypto";

// App-layer encryption for integration tokens at rest (access/refresh tokens in
// tenant_integrations). Keeps secrets out of plaintext columns and out of the
// browser. Key from env INTEGRATIONS_ENC_KEY: 32 bytes as hex (64 chars) or
// base64. Generate one with:  openssl rand -base64 32
// Format of the stored value: v1:<iv b64>:<tag b64>:<ciphertext b64>.
// See docs/integrations-phase-a-plan.md (A2).

const ALG = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.INTEGRATIONS_ENC_KEY;
  if (!raw) throw new Error("INTEGRATIONS_ENC_KEY is not set");
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATIONS_ENC_KEY must decode to 32 bytes (hex or base64)");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unsupported secret format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(ALG, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
