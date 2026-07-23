import { authenticateApiKey } from "@/lib/api/keys";
import { verifyAccessToken } from "@/lib/oauth/store";

// Resolves the /api/mcp bearer credential to a tenant + scopes. Accepts BOTH:
//   • a SmartProps API key (sp_live_…) — the local/dev + Cursor path, and
//   • an OAuth access token (sp_mcp_at_…) — the claude.ai connector path.
// Returns a uniform result or null (→ 401). `rateKey` is a uuid used by the
// per-key rate limiter (the API key's id, or the OAuth token row id).
export interface McpAuth {
  tenantId: string;
  scopes: string[];
  rateKey: string;
  source: "api_key" | "oauth";
}

export async function resolveMcpAuth(req: Request): Promise<McpAuth | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  if (token.startsWith("sp_mcp_at_")) {
    const info = await verifyAccessToken(token);
    if (!info) return null;
    return {
      tenantId: info.tenant_id,
      scopes: info.scope.split(/\s+/).filter(Boolean),
      rateKey: info.id,
      source: "oauth",
    };
  }

  // Fall back to the API-key path (also handles the sp_live_ prefix check + 401).
  const auth = await authenticateApiKey(req);
  if ("response" in auth) return null;
  return { tenantId: auth.tenantId, scopes: auth.scopes, rateKey: auth.keyId, source: "api_key" };
}
