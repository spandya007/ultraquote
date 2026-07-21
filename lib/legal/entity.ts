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
  /** Legal contracting party (the entity that contracts with users), e.g. "SmartProps LLC". */
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

// SmartProps LLC (legal party). Email-only public contact — the personal name,
// home address, and phone are intentionally NOT published in the legal docs.
// NOTE: form SmartProps LLC before go-live so the docs are accurate when public.
export const ENTITY: LegalEntity = {
  legalName: "SmartProps LLC",
  dba: null,
  productName: "SmartProps",
  addressLines: [],
  phone: "",
  contactEmail: "hello@smartprops.io",
  privacyEmail: "privacy@smartprops.io",
  appUrl: "https://app.smartprops.io",
  appDomain: "app.smartprops.io",
};

/**
 * The standard legal-party phrasing, e.g. "Acme LLC (doing business as Acme)" when a dba is set.
 * With `dba` null (the current SmartProps LLC case) this returns just the legal name.
 */
export function legalParty(): string {
  return ENTITY.dba ? `${ENTITY.legalName} (doing business as ${ENTITY.dba})` : ENTITY.legalName;
}
