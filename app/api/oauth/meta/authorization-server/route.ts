import { NextResponse } from "next/server";
import { authorizationServerMetadata, publicOrigin, OAUTH_CORS } from "@/lib/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served at /.well-known/oauth-authorization-server (via next.config rewrite).
export function GET(req: Request) {
  return NextResponse.json(authorizationServerMetadata(publicOrigin()), { headers: OAUTH_CORS });
}
export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
