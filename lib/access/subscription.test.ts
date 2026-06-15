import { describe, it, expect, vi, afterEach } from "vitest";
import { computeEndDate, subscriptionStatus } from "./subscription";

describe("computeEndDate", () => {
  it("adds the term to the start date", () => {
    expect(computeEndDate("2026-06-13", "monthly")).toBe("2026-07-13");
    expect(computeEndDate("2026-06-13", "quarterly")).toBe("2026-09-13");
    expect(computeEndDate("2026-06-13", "yearly")).toBe("2027-06-13");
  });

  it("returns null for a custom term (admin picks the end date)", () => {
    expect(computeEndDate("2026-06-13", "custom")).toBeNull();
  });

  it("rolls over month overflow (Jan 31 + 1 month → early March in a non-leap year)", () => {
    // Documented behavior: JS month math overflows rather than clamping.
    expect(computeEndDate("2026-01-31", "monthly")).toBe("2026-03-03");
  });

  it("returns null for an invalid start date", () => {
    expect(computeEndDate("not-a-date", "monthly")).toBeNull();
  });
});

describe("subscriptionStatus", () => {
  afterEach(() => vi.useRealTimers());
  const freeze = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${iso}T12:00:00.000Z`));
  };

  it("suspended wins regardless of dates (platform switch off)", () => {
    freeze("2026-06-14");
    expect(subscriptionStatus("2026-12-31", false).status).toBe("suspended");
    expect(subscriptionStatus(null, false).status).toBe("suspended");
  });

  it("null end date is unlimited/active", () => {
    freeze("2026-06-14");
    expect(subscriptionStatus(null, true).status).toBe("unlimited");
  });

  it("active when the end date is comfortably in the future", () => {
    freeze("2026-06-14");
    expect(subscriptionStatus("2026-12-31", true).status).toBe("active");
  });

  it("expiring within the 7-day window (incl. today)", () => {
    freeze("2026-06-14");
    expect(subscriptionStatus("2026-06-18", true).status).toBe("expiring"); // 4 days out
    expect(subscriptionStatus("2026-06-14", true).status).toBe("expiring"); // today
  });

  it("grace from end+1 through end+7", () => {
    freeze("2026-06-14");
    expect(subscriptionStatus("2026-06-13", true).status).toBe("grace"); // yesterday
    expect(subscriptionStatus("2026-06-07", true).status).toBe("grace"); // exactly 7 days ago
  });

  it("expired once past the 7-day grace", () => {
    freeze("2026-06-14");
    expect(subscriptionStatus("2026-06-06", true).status).toBe("expired"); // 8 days ago
  });
});
