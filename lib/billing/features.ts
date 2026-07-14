// Plan (subscription tier) + feature registry — the single source of truth for
// WHAT plans and features exist. WHICH plans get which features lives in the
// admin-editable `plan_features` table (see lib/billing/entitlements.ts).
// Introduced for the integrations gate — docs/integrations-phase-a-plan.md (A1).
//
// This mirrors (a minimal slice of) the plan model in docs/stripe-billing-design.md
// / docs/pricing-model-design.md §2. Prices are NOT here — only the non-price
// identity of each plan. Plan is admin-set for now (no Stripe yet).

export type PlanKey =
  | "beta"
  | "pay_per_use"
  | "starter"
  | "standard"
  | "pro"
  | "ultra";

export interface PlanDef {
  key: PlanKey;
  label: string;
  // A recurring subscription plan? (pay_per_use + beta are not subscriptions.)
  subscription: boolean;
}

export const PLANS: PlanDef[] = [
  { key: "beta", label: "Beta", subscription: false },
  { key: "pay_per_use", label: "Pay-per-use", subscription: false },
  { key: "starter", label: "Starter", subscription: true },
  { key: "standard", label: "Standard", subscription: true },
  { key: "pro", label: "Pro", subscription: true },
  { key: "ultra", label: "Ultra", subscription: true },
];

export const PLAN_KEYS: PlanKey[] = PLANS.map((p) => p.key);

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === "string" && (PLAN_KEYS as string[]).includes(v);
}

export function planLabel(key: string): string {
  return PLANS.find((p) => p.key === key)?.label ?? key;
}

export type FeatureKey = "integrations";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
}

export const FEATURES: FeatureDef[] = [
  {
    key: "integrations",
    label: "Integrations",
    description:
      "Connect QuickBooks Online and other cloud services (accounting, CRM, distributors).",
  },
];

export const FEATURE_KEYS: FeatureKey[] = FEATURES.map((f) => f.key);

export function isFeatureKey(v: unknown): v is FeatureKey {
  return typeof v === "string" && (FEATURE_KEYS as string[]).includes(v);
}
