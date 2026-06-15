import { describe, it, expect } from "vitest";
import { validatePassword, checkPassword, MIN_PASSWORD_LENGTH } from "./password";

describe("validatePassword", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Str0ng!Passphrase")).toBeNull();
  });

  it("rejects passwords shorter than the minimum", () => {
    expect(validatePassword("Ab1!xyz")).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
  });

  it("requires at least 3 character classes", () => {
    // 12+ chars but lowercase only → only 1 class
    expect(validatePassword("abcdefghijkl")).toMatch(/3 of/);
  });

  it("rejects passwords containing the email local part", () => {
    expect(validatePassword("janeStr0ng!XY", "jane@acme.com")).toMatch(/email/i);
  });

  it("flags common/denylisted passwords via the common rule", () => {
    // NOTE: every denylist entry is lowercase-only, so validatePassword's
    // message precedence hits the "classes" rule first. The common-password
    // rule itself is asserted directly through checkPassword.
    const common = checkPassword("password", "x@y.com").find((c) => c.id === "common");
    expect(common?.ok).toBe(false);
    const fine = checkPassword("Str0ng!Passphrase", "x@y.com").find((c) => c.id === "common");
    expect(fine?.ok).toBe(true);
  });
});

describe("checkPassword", () => {
  it("returns the four rule checks", () => {
    const checks = checkPassword("Str0ng!Passphrase");
    expect(checks.map((c) => c.id).sort()).toEqual(["classes", "common", "email", "length"]);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it("ignores short email local parts (<4 chars)", () => {
    // local part "ab" is too short to trigger the email rule
    const emailCheck = checkPassword("abXyz123!@#$", "ab@acme.com").find((c) => c.id === "email");
    expect(emailCheck?.ok).toBe(true);
  });
});
