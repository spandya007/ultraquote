import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public API key lifecycle + bearer authentication (Phase C2). Keys are shown
// once, stored as SHA-256 hashes (service-role only, like mfa_recovery_codes).
// Format: sp_live_<48 hex chars>. The prefix stored for display is the first
// 12 chars of the random part (enough to identify a key without revealing it).
// docs/integrations-phase-c-api-webhooks-zapier.md §3.1–3.2.

export const KEY_PREFIX = "sp_live_";
export type ApiScope = "read" | "write";

export interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export function hashApiKey(full: string): string {
  return crypto.createHash("sha256").update(full).digest("hex");
}

// Returns the full key (shown once), its display prefix, and its hash (stored).
export function generateApiKey(): { full: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const full = KEY_PREFIX + random;
  return { full, prefix: KEY_PREFIX + random.slice(0, 12), hash: hashApiKey(full) };
}

export async function createApiKey(params: {
  tenantId: string;
  name: string;
  scopes: ApiScope[];
  createdBy?: string | null;
}): Promise<{ id: string; full: string; prefix: string }> {
  const admin = createAdminClient();
  const { full, prefix, hash } = generateApiKey();
  const { data, error } = await admin
    .from("tenant_api_keys")
    .insert({
      tenant_id: params.tenantId,
      name: params.name,
      key_hash: hash,
      key_prefix: prefix,
      scopes: params.scopes,
      created_by: params.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createApiKey failed: ${error.message}`);
  return { id: (data as { id: string }).id, full, prefix };
}

export async function listApiKeys(tenantId: string): Promise<ApiKeySummary[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, created_at, revoked_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ApiKeySummary[];
}

export async function revokeApiKey(id: string, tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`revokeApiKey failed: ${error.message}`);
  return !!data;
}

export interface ApiAuth {
  tenantId: string;
  scopes: string[];
  keyId: string;
}

// Resolve a Bearer key to its tenant/scopes, or a 401 NextResponse. Throttles the
// last_used_at write to at most once per minute per key.
export async function authenticateApiKey(req: Request): Promise<ApiAuth | { response: NextResponse }> {
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  const unauthorized = () =>
    ({ response: NextResponse.json({ error: { code: "unauthorized", message: "Missing or invalid API key." } }, { status: 401 }) });
  if (!token || !token.startsWith(KEY_PREFIX)) return unauthorized();

  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_api_keys")
    .select("id, tenant_id, scopes, revoked_at, last_used_at")
    .eq("key_hash", hashApiKey(token))
    .maybeSingle();
  if (!data || data.revoked_at) return unauthorized();

  // Throttled usage stamp — avoid a write on every single request.
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (Date.now() - last > 60_000) {
    await admin.from("tenant_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { tenantId: data.tenant_id, scopes: data.scopes ?? [], keyId: data.id };
}
