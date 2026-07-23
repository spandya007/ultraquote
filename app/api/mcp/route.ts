import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveMcpAuth } from "@/lib/mcp/auth";
import { tenantHasFeature } from "@/lib/billing/entitlements";
import { enforceRateLimit } from "@/lib/api/ratelimit";
import { ScopedDb } from "@/lib/api/scoped";
import { buildMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remote MCP server (Streamable HTTP, stateless) at POST /api/mcp — Phase C+
// Appendix A. Authenticated by EITHER a SmartProps API key (sp_live_…) or an
// OAuth 2.1 access token (sp_mcp_at_…, the claude.ai connector). Reuses the C2
// tenant isolation + entitlement + rate-limit gates, then serves the tools via
// ScopedDb/serializers directly (no HTTP hop).

// On 401 we point clients at the OAuth protected-resource metadata so an MCP
// client can discover the authorization server and start the OAuth flow.
function unauthorized(req: Request) {
  const origin = new URL(req.url).origin;
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    },
  });
}

export async function POST(req: Request) {
  const auth = await resolveMcpAuth(req);
  if (!auth) return unauthorized(req);
  if (!(await tenantHasFeature(auth.tenantId, "integrations"))) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32003, message: "This workspace's plan does not include API access." }, id: null }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const limited = await enforceRateLimit(auth.rateKey);
  if (limited) return limited;

  // Fresh, tenant-scoped server + stateless transport per request (Netlify-safe:
  // no long-lived session; JSON responses instead of SSE).
  const server = buildMcpServer({ db: new ScopedDb(auth.tenantId), scopes: auth.scopes });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Stateless JSON mode doesn't use the GET SSE stream; surface a clear 401/405.
export async function GET(req: Request) {
  const auth = await resolveMcpAuth(req);
  if (!auth) return unauthorized(req);
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST for MCP requests (stateless JSON mode)." }, id: null }), {
    status: 405, headers: { "Content-Type": "application/json" },
  });
}
