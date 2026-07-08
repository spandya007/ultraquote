import { describe, it, expect, afterEach } from "vitest";
import { maxDraftCallsPerQuote, maxDraftCallsPerTenantMonth } from "./limits";

const KEY = "MAX_AI_DRAFT_CALLS_PER_QUOTE";
const TENANT_KEY = "MAX_AI_DRAFT_CALLS_PER_TENANT_MONTH";
afterEach(() => { delete process.env[KEY]; delete process.env[TENANT_KEY]; });

describe("maxDraftCallsPerQuote", () => {
  it("defaults to 25 when the env var is unset", () => {
    delete process.env[KEY];
    expect(maxDraftCallsPerQuote()).toBe(25);
  });

  it("reads a positive integer from the env var", () => {
    process.env[KEY] = "40";
    expect(maxDraftCallsPerQuote()).toBe(40);
  });

  it("falls back to 25 for invalid or non-positive values", () => {
    process.env[KEY] = "abc"; expect(maxDraftCallsPerQuote()).toBe(25);
    process.env[KEY] = "0";   expect(maxDraftCallsPerQuote()).toBe(25);
    process.env[KEY] = "-5";  expect(maxDraftCallsPerQuote()).toBe(25);
    process.env[KEY] = "";    expect(maxDraftCallsPerQuote()).toBe(25);
  });
});

describe("maxDraftCallsPerTenantMonth", () => {
  it("defaults to 2000 when the env var is unset", () => {
    delete process.env[TENANT_KEY];
    expect(maxDraftCallsPerTenantMonth()).toBe(2000);
  });

  it("reads a positive integer from the env var", () => {
    process.env[TENANT_KEY] = "500";
    expect(maxDraftCallsPerTenantMonth()).toBe(500);
  });

  it("falls back to 2000 for invalid or non-positive values", () => {
    process.env[TENANT_KEY] = "nope"; expect(maxDraftCallsPerTenantMonth()).toBe(2000);
    process.env[TENANT_KEY] = "0";    expect(maxDraftCallsPerTenantMonth()).toBe(2000);
    process.env[TENANT_KEY] = "-1";   expect(maxDraftCallsPerTenantMonth()).toBe(2000);
  });
});
