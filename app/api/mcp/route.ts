import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiKey } from "@/lib/api/keys";
import { tenantHasFeature } from "@/lib/billing/entitlements";
import { enforceRateLimit } from "@/lib/api/ratelimit";
import { ScopedDb } from "@/lib/api/scoped";
import { buildMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remote MCP server (Streamable HTTP, stateless) at POST /api/mcp — Phase C+
// Appendix A, slice 1. Authenticated by a SmartProps API key as a Bearer token
// (OAuth 2.1 is slice 2). Reuses the C2 auth + tenant isolation + entitlement +
// rate-limit gates, then serves the same tools as the local server, but calling
// ScopedDb/serializers directly (no HTTP hop). Usable from MCP Inspector / Cursor
// with the key as a bearer token.

function jsonRpcError(status: number, code: number, message: string, headers?: Record<string, string>) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if ("response" in auth) {
    // Advertise where auth comes from (OAuth resource metadata is added in slice 2).
    return jsonRpcError(401, -32001, "Unauthorized: provide a SmartProps API key as a Bearer token.");
  }
  if (!(await tenantHasFeature(auth.tenantId, "integrations"))) {
    return jsonRpcError(403, -32003, "This workspace's plan does not include API access.");
  }
  const limited = await enforceRateLimit(auth.keyId);
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
  const auth = await authenticateApiKey(req);
  if ("response" in auth) {
    return jsonRpcError(401, -32001, "Unauthorized: provide a SmartProps API key as a Bearer token.");
  }
  return jsonRpcError(405, -32000, "Use POST for MCP requests (stateless JSON mode).");
}
