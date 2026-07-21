// Single source of truth for the legal/contracting identity + canonical contact
// details of the business behind this app. Referenced by the code-rendered
// contact surfaces (the tenant data-export report, deletion/privacy notices,
// notification-email fallbacks) so a rename or a future entity change
// (sole proprietor → LLC/Inc.) is a ONE-LINE edit here instead of a scavenger
// hunt across the codebase.
//
// SCOPE NOTE: the long-form legal documents (/terms, /privacy-policy,
// /cookie-policy) are Termly-generated static HTML (app/*/*-html.ts) and are
// regenerated as a unit when the policy changes — they are deliberately NOT
// interpolated from this file. When you regenerate them, use the values below as
// the canonical party / address / contact so everything stays consistent.
//
// Renaming to SmartProps or forming a real entity later: see
// docs/rename-to-smartprops-assessment.md (§6) + docs/rename-to-smartprops-checklist.md (Phase 4a).

export interface LegalEntity {
  /** Legal contracting party. Today the sole proprietor; becomes e.g. "SmartProps LLC" if an entity is formed. */
  legalName: string;
  /** Assumed / "doing business as" name. Set to null once the entity name itself IS the trade name. */
  dba: string | null;
  /** Customer-facing product/brand name used in reports + notices. */
  productName: string;
  /** Postal address lines for legal notices / the mailing address. */
  addressLines: string[];
  /** Contact phone (appears in the legal terms). */
  phone: string;
  /** General/support inbox. */
  contactEmail: string;
  /** Privacy / data-request inbox. */
  privacyEmail: string;
  /** Canonical app URL (with scheme). */
  appUrl: string;
  /** Bare app host, for plain-text footers where a scheme would be noise. */
  appDomain: string;
}

// SmartProps values (post-rename 2026-07). `legalName` stays the sole proprietor
// until an entity is formed (then set it to e.g. "SmartProps LLC" + `dba: null`).
export const ENTITY: LegalEntity = {
  legalName: "Sameer Pandya",
  dba: "SmartProps",
  productName: "SmartProps",
  addressLines: ["2005 Laurel Canyon Court", "Fremont, CA 94539", "United States"],
  phone: "510-250-1688",
  contactEmail: "hello@smartprops.io",
  privacyEmail: "privacy@smartprops.io",
  appUrl: "https://app.smartprops.io",
  appDomain: "app.smartprops.io",
};

/**
 * The standard legal-party phrasing, e.g. "Sameer Pandya (doing business as SmartProps)".
 * Once an entity is formed and `dba` is null, this returns just the legal name.
 */
export function legalParty(): string {
  return ENTITY.dba ? `${ENTITY.legalName} (doing business as ${ENTITY.dba})` : ENTITY.legalName;
}
