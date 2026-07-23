// OAuth discovery documents. Protected Resource Metadata (RFC 9728) + Authorization
// Server Metadata (RFC 8414). Served (via next.config rewrites) at:
//   /.well-known/oauth-protected-resource   → the MCP resource
//   /.well-known/oauth-authorization-server  → this app as the AS

// The public origin the CLIENT actually used — derived from the forwarded Host
// header (Netlify/proxies set these), not req.url, whose host can be an internal
// deploy permalink. Critical for OAuth: the advertised issuer/resource must match
// the URL the client fetched, or strict issuer matching fails.
export function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["read", "write"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/api/v1/openapi.json`,
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: ["read", "write"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

// Permissive CORS for the browser-side/cross-origin OAuth + metadata calls MCP
// clients make. These endpoints carry no cookies and no per-user secrets in GET.
export const OAUTH_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
