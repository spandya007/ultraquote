import { describe, it, expect } from "vitest";
import { s256Challenge, verifyPkce } from "./pkce";
import { protectedResourceMetadata, authorizationServerMetadata } from "./metadata";

describe("pkce.s256Challenge", () => {
  it("matches the RFC 7636 Appendix B test vector", () => {
    // From RFC 7636 §B: verifier → challenge (base64url of sha256).
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(s256Challenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("has no base64 padding or url-unsafe chars", () => {
    const c = s256Challenge("a".repeat(43));
    expect(c).not.toMatch(/[+/=]/);
  });
});

describe("pkce.verifyPkce", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  it("accepts the matching verifier (S256)", () => {
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
  });
  it("rejects a wrong verifier", () => {
    expect(verifyPkce("wrong-verifier-that-is-at-least-forty-three-chars-x", challenge, "S256")).toBe(false);
  });
  it("rejects non-S256 methods (plain not allowed)", () => {
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
  });
  it("rejects too-short verifiers", () => {
    expect(verifyPkce("short", s256Challenge("short"), "S256")).toBe(false);
  });
});

describe("oauth metadata", () => {
  it("protected-resource points at the MCP endpoint + this AS", () => {
    const m = protectedResourceMetadata("https://app.smartprops.io");
    expect(m.resource).toBe("https://app.smartprops.io/api/mcp");
    expect(m.authorization_servers).toEqual(["https://app.smartprops.io"]);
  });
  it("AS metadata advertises PKCE S256 + the code flow endpoints", () => {
    const m = authorizationServerMetadata("https://app.smartprops.io");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.authorization_endpoint).toBe("https://app.smartprops.io/authorize");
    expect(m.token_endpoint).toBe("https://app.smartprops.io/api/oauth/token");
    expect(m.registration_endpoint).toBe("https://app.smartprops.io/api/oauth/register");
    expect(m.grant_types_supported).toContain("refresh_token");
  });
});
