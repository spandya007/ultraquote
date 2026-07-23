import { NextResponse } from "next/server";
import { registerClient } from "@/lib/oauth/store";
import { OAUTH_CORS } from "@/lib/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dynamic Client Registration (RFC 7591). MCP clients POST their redirect_uris
// (and optional metadata); we mint a public client_id (PKCE, no secret).
function validRedirect(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol === "https:") return true;
    // Allow http only for localhost (native clients' loopback redirect).
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const redirect_uris: unknown = body.redirect_uris;
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0 || !redirect_uris.every((u) => typeof u === "string" && validRedirect(u))) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be a non-empty array of https (or localhost http) URLs." },
      { status: 400, headers: OAUTH_CORS }
    );
  }

  const client = await registerClient({
    client_name: typeof body.client_name === "string" ? body.client_name : undefined,
    redirect_uris: redirect_uris as string[],
    grant_types: Array.isArray(body.grant_types) ? body.grant_types : undefined,
    response_types: Array.isArray(body.response_types) ? body.response_types : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
  });

  // RFC 7591 response — echo the registered metadata + the issued client_id.
  return NextResponse.json(
    {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      scope: client.scope,
    },
    { status: 201, headers: OAUTH_CORS }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
