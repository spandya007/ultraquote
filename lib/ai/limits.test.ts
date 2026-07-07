import { describe, it, expect, afterEach } from "vitest";
import { maxDraftCallsPerQuote } from "./limits";

const KEY = "MAX_AI_DRAFT_CALLS_PER_QUOTE";
afterEach(() => { delete process.env[KEY]; });

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
