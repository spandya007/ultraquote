import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderKey } from "./providers";

// Read/derive tenant integration connection state. Tokens are never returned to
// the browser — this returns only status metadata safe for the Settings UI.
// See docs/integrations-phase-a-plan.md (A2).

export interface IntegrationConnection {
  provider: ProviderKey;
  status: "connected" | "error" | "disconnected";
  account_ref: string | null;
  connected_at: string | null;
}

export async function getTenantConnections(tenantId: string): Promise<IntegrationConnection[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_integrations")
    .select("provider, status, account_ref, created_at")
    .eq("tenant_id", tenantId);
  return ((data ?? []) as Array<{
    provider: ProviderKey;
    status: IntegrationConnection["status"];
    account_ref: string | null;
    created_at: string | null;
  }>).map((r) => ({
    provider: r.provider,
    status: r.status,
    account_ref: r.account_ref,
    connected_at: r.created_at,
  }));
}
