import { describe, it, expect, vi, afterEach } from "vitest";
import { effectiveStatus, isStaleDraft } from "./quote-status";

describe("effectiveStatus", () => {
  afterEach(() => vi.useRealTimers());
  const freeze = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("returns the stored status for drafts (no expiry derivation)", () => {
    expect(effectiveStatus({ status: "draft", valid_until: "2000-01-01" })).toBe("draft");
  });

  it("derives expired for sent/viewed past valid_until", () => {
    freeze("2026-06-14T12:00:00");
    expect(effectiveStatus({ status: "sent", valid_until: "2026-06-13" })).toBe("expired");
    expect(effectiveStatus({ status: "viewed", valid_until: "2026-06-13" })).toBe("expired");
  });

  it("keeps sent when valid_until is still in the future", () => {
    freeze("2026-06-14T12:00:00");
    expect(effectiveStatus({ status: "sent", valid_until: "2026-12-31" })).toBe("sent");
  });

  it("never expires terminal statuses like signed", () => {
    freeze("2026-06-14T12:00:00");
    expect(effectiveStatus({ status: "signed", valid_until: "2026-06-13" })).toBe("signed");
  });
});

describe("isStaleDraft", () => {
  afterEach(() => vi.useRealTimers());
  const freeze = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("only applies to drafts", () => {
    freeze("2026-06-14T12:00:00Z");
    expect(isStaleDraft({ status: "sent", updated_at: "2020-01-01" }, 30)).toBe(false);
  });

  it("is stale when last activity is older than validDays", () => {
    freeze("2026-06-14T12:00:00Z");
    expect(isStaleDraft({ status: "draft", updated_at: "2026-04-01" }, 30)).toBe(true);
  });

  it("is not stale when recently updated", () => {
    freeze("2026-06-14T12:00:00Z");
    expect(isStaleDraft({ status: "draft", updated_at: "2026-06-13" }, 30)).toBe(false);
  });

  it("falls back to created_at, and is not stale without any date", () => {
    freeze("2026-06-14T12:00:00Z");
    expect(isStaleDraft({ status: "draft", created_at: "2026-04-01" }, 30)).toBe(true);
    expect(isStaleDraft({ status: "draft" }, 30)).toBe(false);
  });
});
