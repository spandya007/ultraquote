import { createAdminClient } from "@/lib/supabase/admin";
import { getUserContext } from "@/lib/auth/user-context";
import type { FeatureKey } from "./features";

// Feature ENTITLEMENT resolver — "does this tenant's plan include this feature?"
// Distinct from lib/access (the account LIFECYCLE gate: is the account live?).
// Reads the admin-editable `plan_features` matrix via the service-role client
// (entitlements are platform-managed and must not depend on the caller's RLS
// visibility). See docs/integrations-phase-a-plan.md (A1).

// plan -> feature_key -> enabled
export type EntitlementMatrix = Record<string, Record<string, boolean>>;

export interface PlanFeatureRow {
  plan: string;
  feature_key: string;
  enabled: boolean;
}

// ── Pure helpers (unit-tested; no DB) ─────────────────────────────────────────

export function buildMatrix(rows: PlanFeatureRow[]): EntitlementMatrix {
  const m: EntitlementMatrix = {};
  for (const r of rows) {
    (m[r.plan] ??= {})[r.feature_key] = r.enabled;
  }
  return m;
}

// Missing plan or missing (plan,feature) row = NOT entitled (fail closed).
export function matrixHasFeature(
  matrix: EntitlementMatrix,
  plan: string | null | undefined,
  feature: string
): boolean {
  if (!plan) return false;
  return Boolean(matrix[plan]?.[feature]);
}

// ── DB-backed resolvers ───────────────────────────────────────────────────────

export async function planHasFeature(plan: string, feature: FeatureKey): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("plan_features")
    .select("enabled")
    .eq("plan", plan)
    .eq("feature_key", feature)
    .maybeSingle();
  return Boolean(data?.enabled);
}

// Resolve by tenant id (fetches the tenant's plan, then the matrix row).
export async function tenantHasFeature(tenantId: string, feature: FeatureKey): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("tenants").select("plan").eq("id", tenantId).maybeSingle();
  const plan = (data?.plan as string | undefined) ?? null;
  if (!plan) return false;
  return planHasFeature(plan, feature);
}

// Convenience for server components that already resolved the user: getUserContext
// joins the full tenant row (incl. `plan`), so this avoids a second tenants fetch.
export async function userHasFeature(userId: string, feature: FeatureKey): Promise<boolean> {
  const ctx = await getUserContext(userId);
  const plan = (ctx?.tenant?.plan as string | undefined) ?? null;
  if (!plan) return false;
  return planHasFeature(plan, feature);
}
