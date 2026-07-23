import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Service-role storage for the OAuth AS (migration 034). Codes + tokens are
// stored as SHA-256 hashes; plaintext is returned once. All tables are
// service-role only. docs/integrations-phase-c-api-webhooks-zapier.md Appendix A.2.

export const ACCESS_TTL_SEC = 60 * 60;          // 1 hour
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;      // 30 days
const CODE_TTL_SEC = 60 * 5;                    // 5 minutes

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const randomToken = (prefix: string) => prefix + crypto.randomBytes(32).toString("hex");

// ── Clients (dynamic registration) ────────────────────────────────────────────
export interface OAuthClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string | null;
}

export async function registerClient(input: {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}): Promise<OAuthClient> {
  const admin = createAdminClient();
  const client_id = "mcp_" + crypto.randomBytes(16).toString("hex");
  const row = {
    client_id,
    client_name: input.client_name ?? null,
    redirect_uris: input.redirect_uris,
    grant_types: input.grant_types?.length ? input.grant_types : ["authorization_code", "refresh_token"],
    response_types: input.response_types?.length ? input.response_types : ["code"],
    token_endpoint_auth_method: "none",
    scope: input.scope ?? "read write",
  };
  const { error } = await admin.from("oauth_clients").insert(row);
  if (error) throw new Error(`registerClient failed: ${error.message}`);
  return row as OAuthClient;
}

export async function getClient(client_id: string): Promise<OAuthClient | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("oauth_clients").select("*").eq("client_id", client_id).maybeSingle();
  return (data as OAuthClient) ?? null;
}

// ── Authorization codes ───────────────────────────────────────────────────────
export async function issueAuthCode(input: {
  client_id: string;
  user_id: string;
  tenant_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource?: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const code = randomToken("mcpc_");
  const { error } = await admin.from("oauth_authorization_codes").insert({
    code_hash: sha256(code),
    client_id: input.client_id,
    user_id: input.user_id,
    tenant_id: input.tenant_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    scope: input.scope,
    resource: input.resource ?? null,
    expires_at: new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString(),
  });
  if (error) throw new Error(`issueAuthCode failed: ${error.message}`);
  return code;
}

export interface AuthCodeRow {
  client_id: string; user_id: string; tenant_id: string; redirect_uri: string;
  code_challenge: string; code_challenge_method: string; scope: string; resource: string | null;
  expires_at: string;
}

// Single-use: fetch + delete atomically-ish (delete returns the row). Returns null
// if not found or expired.
export async function consumeAuthCode(code: string): Promise<AuthCodeRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_authorization_codes")
    .delete()
    .eq("code_hash", sha256(code))
    .select("*")
    .maybeSingle();
  if (!data) return null;
  if (new Date((data as AuthCodeRow).expires_at).getTime() < Date.now()) return null;
  return data as AuthCodeRow;
}

// ── Tokens ────────────────────────────────────────────────────────────────────
export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export async function issueTokens(input: {
  client_id: string; user_id: string; tenant_id: string; scope: string; resource?: string | null;
}): Promise<IssuedTokens> {
  const admin = createAdminClient();
  const access_token = randomToken("sp_mcp_at_");
  const refresh_token = randomToken("sp_mcp_rt_");
  const now = Date.now();
  const rows = [
    { token_hash: sha256(access_token), kind: "access", expires_at: new Date(now + ACCESS_TTL_SEC * 1000).toISOString() },
    { token_hash: sha256(refresh_token), kind: "refresh", expires_at: new Date(now + REFRESH_TTL_SEC * 1000).toISOString() },
  ].map((t) => ({ ...t, client_id: input.client_id, user_id: input.user_id, tenant_id: input.tenant_id, scope: input.scope, resource: input.resource ?? null }));
  const { error } = await admin.from("oauth_tokens").insert(rows);
  if (error) throw new Error(`issueTokens failed: ${error.message}`);
  return { access_token, refresh_token, expires_in: ACCESS_TTL_SEC, scope: input.scope };
}

export interface AccessTokenInfo { id: string; tenant_id: string; user_id: string; scope: string; client_id: string; }

export async function verifyAccessToken(token: string): Promise<AccessTokenInfo | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_tokens")
    .select("id, tenant_id, user_id, scope, client_id, kind, revoked_at, expires_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data || data.kind !== "access" || data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { id: data.id, tenant_id: data.tenant_id, user_id: data.user_id, scope: data.scope, client_id: data.client_id };
}

// Rotate a refresh token: verify it, revoke it, issue a fresh access+refresh pair.
export async function rotateRefreshToken(refreshToken: string, clientId: string): Promise<IssuedTokens | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("oauth_tokens")
    .select("id, tenant_id, user_id, scope, client_id, resource, kind, revoked_at, expires_at")
    .eq("token_hash", sha256(refreshToken))
    .maybeSingle();
  if (!data || data.kind !== "refresh" || data.revoked_at || data.client_id !== clientId) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  await admin.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
  return issueTokens({ client_id: data.client_id, user_id: data.user_id, tenant_id: data.tenant_id, scope: data.scope, resource: data.resource });
}
