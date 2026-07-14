import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "./crypto";
import type { ProviderKey } from "./providers";

// Read/derive tenant integration connection state. Tokens are never returned to
// the browser — getTenantConnections returns only status metadata safe for the
// Settings UI; the token-bearing helpers below are server-only.
// See docs/integrations-phase-a-plan.md (A2/A3).

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

// ── Server-only token helpers (never call from client code) ───────────────────

export interface ConnectionSecrets {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  accountRef: string | null;
  status: IntegrationConnection["status"];
  settings: Record<string, unknown>;
}

// Decrypted tokens + metadata for a tenant's provider connection, or null.
export async function getConnectionSecrets(
  tenantId: string,
  provider: ProviderKey
): Promise<ConnectionSecrets | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_integrations")
    .select("access_token, refresh_token, expires_at, account_ref, status, settings")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data) return null;
  return {
    accessToken: data.access_token ? decryptSecret(data.access_token) : null,
    refreshToken: data.refresh_token ? decryptSecret(data.refresh_token) : null,
    expiresAt: data.expires_at ?? null,
    accountRef: data.account_ref ?? null,
    status: data.status,
    settings: (data.settings as Record<string, unknown>) ?? {},
  };
}

// Upsert a connection with freshly-encrypted tokens. Used on connect + refresh.
export async function saveConnection(params: {
  tenantId: string;
  provider: ProviderKey;
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  accountRef?: string | null;
  scopes?: string | null;
  connectedBy?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_integrations").upsert(
    {
      tenant_id: params.tenantId,
      provider: params.provider,
      status: "connected",
      auth_type: "oauth2",
      access_token: encryptSecret(params.accessToken),
      refresh_token: encryptSecret(params.refreshToken),
      expires_at: params.expiresAt,
      account_ref: params.accountRef ?? null,
      scopes: params.scopes ?? null,
      connected_by: params.connectedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,provider" }
  );
  if (error) throw new Error(`saveConnection failed: ${error.message}`);
}

// Update just the tokens after a refresh (keeps account_ref/settings).
export async function updateConnectionTokens(params: {
  tenantId: string;
  provider: ProviderKey;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("tenant_integrations")
    .update({
      access_token: encryptSecret(params.accessToken),
      refresh_token: encryptSecret(params.refreshToken),
      expires_at: params.expiresAt,
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", params.tenantId)
    .eq("provider", params.provider);
}

export async function deleteConnection(tenantId: string, provider: ProviderKey): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("tenant_integrations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", provider);
}
