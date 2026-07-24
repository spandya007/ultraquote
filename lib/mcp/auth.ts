import { authenticateApiKey } from "@/lib/api/keys";
import { verifyAccessToken } from "@/lib/oauth/store";
import { createAdminClient } from "@/lib/supabase/admin";

// Resolves the /api/mcp bearer credential to a tenant + scopes. Accepts BOTH:
//   • a SmartProps API key (sp_live_…) — the local/dev + Cursor path, and
//   • an OAuth access token (sp_mcp_at_…) — the claude.ai connector path.
// Returns a uniform result or null (→ 401). `rateKey` is a uuid used by the
// per-key rate limiter (the API key's id, or the OAuth token row id).
export interface McpAuth {
  tenantId: string;
  scopes: string[];
  rateKey: string;
  /** created_by for writes: the OAuth user, or the API key's creator. */
  userId: string | null;
  source: "api_key" | "oauth";
  /** Human name of the caller (OAuth client name / API key name) for provenance. */
  label: string | null;
}

export async function resolveMcpAuth(req: Request): Promise<McpAuth | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  if (token.startsWith("sp_mcp_at_")) {
    const info = await verifyAccessToken(token);
    if (!info) return null;
    // Resolve the OAuth client's display name (e.g. "Claude") for provenance.
    let label: string | null = null;
    const { data: client } = await createAdminClient()
      .from("oauth_clients").select("client_name").eq("client_id", info.client_id).maybeSingle();
    label = client?.client_name ?? null;
    return {
      tenantId: info.tenant_id,
      scopes: info.scope.split(/\s+/).filter(Boolean),
      rateKey: info.id,
      userId: info.user_id,
      source: "oauth",
      label,
    };
  }

  // Fall back to the API-key path (also handles the sp_live_ prefix check + 401).
  const auth = await authenticateApiKey(req);
  if ("response" in auth) return null;
  return { tenantId: auth.tenantId, scopes: auth.scopes, rateKey: auth.keyId, userId: auth.userId, source: "api_key", label: auth.keyName };
}
