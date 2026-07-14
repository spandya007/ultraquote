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
}

export const PROVIDERS: ProviderDef[] = [
  {
    key: "qbo",
    label: "QuickBooks Online",
    category: "accounting",
    description: "Create a customer and an invoice in QuickBooks when a quote is signed.",
    status: "available",
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
