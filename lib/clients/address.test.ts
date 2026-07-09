import { describe, it, expect } from "vitest";
import { composeAddress, hasStructuredAddress } from "./address";

describe("composeAddress", () => {
  it("composes a full structured address on one line", () => {
    expect(
      composeAddress({
        address_street: "123 Main St",
        address_suite: "Suite 400",
        address_city: "Hayward",
        address_state: "CA",
        address_postal: "94541",
        address_country: "USA",
      })
    ).toBe("123 Main St Suite 400, Hayward, CA 94541, USA");
  });

  it("omits missing pieces cleanly", () => {
    expect(
      composeAddress({ address_street: "500 Tech Dr", address_city: "San Jose", address_state: "CA" })
    ).toBe("500 Tech Dr, San Jose, CA");
  });

  it("falls back to legacy free-text address when no structured fields set", () => {
    expect(composeAddress({ address: "1 Old Format Rd, Town, CA" })).toBe("1 Old Format Rd, Town, CA");
  });

  it("prefers structured over legacy when both present", () => {
    expect(
      composeAddress({ address: "legacy should not show", address_city: "Reno", address_state: "NV" })
    ).toBe("Reno, NV");
  });

  it("returns empty string when nothing is set", () => {
    expect(composeAddress({})).toBe("");
  });

  it("supports a newline separator for stacked blocks", () => {
    expect(
      composeAddress({ address_street: "1 A St", address_city: "X", address_postal: "10001" }, "\n")
    ).toBe("1 A St\nX 10001");
  });
});

describe("hasStructuredAddress", () => {
  it("is true when any structured field is present", () => {
    expect(hasStructuredAddress({ address_city: "Reno" })).toBe(true);
  });
  it("is false when only the legacy address is present", () => {
    expect(hasStructuredAddress({ address: "1 Old Rd" })).toBe(false);
  });
});
