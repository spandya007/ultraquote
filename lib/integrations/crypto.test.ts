import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

// A fixed 32-byte test key (base64) so the round-trip is deterministic.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("integration token crypto", () => {
  beforeAll(() => {
    process.env.INTEGRATIONS_ENC_KEY = TEST_KEY;
  });

  it("round-trips a token", () => {
    const token = "refresh-abc123.def456";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("produces a v1-tagged, 4-part payload", () => {
    const parts = encryptSecret("x").split(":");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  it("uses a random IV (ciphertext differs each call)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a tampered payload (GCM auth tag)", () => {
    const enc = encryptSecret("secret");
    const parts = enc.split(":");
    // Flip the last char of the ciphertext.
    const ct = parts[3];
    parts[3] = ct.slice(0, -1) + (ct.slice(-1) === "A" ? "B" : "A");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects an unsupported format", () => {
    expect(() => decryptSecret("v2:a:b:c")).toThrow(/Unsupported secret format/);
  });
});
