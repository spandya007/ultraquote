import { describe, it, expect } from "vitest";
import { brandSystemHeader, type BrandProfile } from "./brand-profile";

const base: BrandProfile = { businessName: "Acme Co", businessType: null, about: null, brandVoice: null };

describe("brandSystemHeader", () => {
  it("uses a neutral role + voice when the profile is empty (never 'MSP')", () => {
    const h = brandSystemHeader(base);
    expect(h).toBe(
      "You are an expert proposal writer for Acme Co, drafting the narrative body of a client-facing proposal.\n" +
        "Write in a confident, professional, client-facing voice."
    );
    expect(h).not.toMatch(/MSP|Managed Service/i);
  });

  it("interpolates type, about, and voice when set", () => {
    const h = brandSystemHeader({
      businessName: "Acme Co",
      businessType: "security camera installer",
      about: "Licensed & insured",
      brandVoice: "warm and consultative",
    });
    expect(h).toContain("for Acme Co — a security camera installer, drafting");
    expect(h).toContain("About Acme Co: Licensed & insured");
    expect(h).toContain("Write in this brand voice: warm and consultative.");
  });

  it("strips trailing punctuation so there's no double period or stray comma", () => {
    const h = brandSystemHeader({
      businessName: "Acme Co",
      businessType: "security camera installer.",
      about: null,
      brandVoice: "warm and consultative, no jargon.",
    });
    // type is mid-sentence → no "installer., drafting"
    expect(h).toContain("a security camera installer, drafting");
    expect(h).not.toContain("installer.,");
    // voice gets exactly one period → no "no jargon.."
    expect(h).toContain("Write in this brand voice: warm and consultative, no jargon.");
    expect(h).not.toContain("jargon..");
  });
});
