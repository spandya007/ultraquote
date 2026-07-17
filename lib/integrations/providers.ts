// Integration provider registry — the code source of truth for WHICH connectors
// exist and their metadata. Connection state lives in `tenant_integrations`
// (lib/integrations/store.ts); feature access is gated by lib/billing/entitlements
// ('integrations'). See docs/integrations-phase-a-plan.md.

export type ProviderKey = "qbo";

export type ProviderCategory = "accounting" | "crm" | "distributor";

export interface ProviderDef {
  key: ProviderKey;
  label: string;
  category: ProviderCategory;
  description: string;
  // 'available' = OAuth/connect flow is wired (A3 flips QBO to this).
  // 'coming_soon' = listed but not yet connectable.
  status: "available" | "coming_soon";
  // Brand logo: drop the vendor's OFFICIAL asset in /public and set this path
  // (subject to the vendor's branding guidelines — for QBO see Intuit's
  // developer branding assets). If the file is missing, the UI falls back to a
  // brand-coloured monogram badge (brandColor + monogram).
  logoSrc?: string;
  brandColor?: string;
  monogram?: string;
  // Vendor's OFFICIAL "Connect to <vendor>" button asset (drop in /public).
  // Rendered unmodified as the connect CTA per the vendor's branding guidelines
  // (QBO: Intuit's "Connect to QuickBooks" button). Missing file → the plain
  // text "Connect" button is shown instead.
  connectButtonSrc?: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    key: "qbo",
    label: "QuickBooks Online",
    category: "accounting",
    description: "Create a customer and an invoice in QuickBooks when a quote is signed.",
    status: "available",
    logoSrc: "/logos/quickbooks.svg",
    brandColor: "#2CA01C", // QuickBooks brand green (monogram fallback only)
    monogram: "qb",
    connectButtonSrc: "/logos/connect-to-quickbooks.svg",
  },
];

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  accounting: "Accounting",
  crm: "CRM",
  distributor: "Distributor",
};

export function isProviderKey(v: unknown): v is ProviderKey {
  return typeof v === "string" && PROVIDERS.some((p) => p.key === v);
}
