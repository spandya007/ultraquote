import { NextResponse } from "next/server";
import { consumeAuthCode, issueTokens, rotateRefreshToken } from "@/lib/oauth/store";
import { verifyPkce } from "@/lib/oauth/pkce";
import { OAUTH_CORS } from "@/lib/oauth/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (code: string, desc: string, status = 400) =>
  NextResponse.json({ error: code, error_description: desc }, { status, headers: OAUTH_CORS });

// Parse either application/x-www-form-urlencoded (the OAuth default) or JSON.
async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v)]));
  }
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(req: Request) {
  const p = await readParams(req);
  const grantType = p.grant_type;

  if (grantType === "authorization_code") {
    const { code, redirect_uri, client_id, code_verifier } = p;
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return err("invalid_request", "code, redirect_uri, client_id, and code_verifier are required.");
    }
    const row = await consumeAuthCode(code);
    if (!row) return err("invalid_grant", "Authorization code is invalid or expired.");
    if (row.client_id !== client_id) return err("invalid_grant", "client_id mismatch.");
    if (row.redirect_uri !== redirect_uri) return err("invalid_grant", "redirect_uri mismatch.");
    if (!verifyPkce(code_verifier, row.code_challenge, row.code_challenge_method)) {
      return err("invalid_grant", "PKCE verification failed.");
    }
    const tokens = await issueTokens({
      client_id, user_id: row.user_id, tenant_id: row.tenant_id, scope: row.scope, resource: row.resource,
    });
    return NextResponse.json({ token_type: "Bearer", ...tokens }, { headers: OAUTH_CORS });
  }

  if (grantType === "refresh_token") {
    const { refresh_token, client_id } = p;
    if (!refresh_token || !client_id) return err("invalid_request", "refresh_token and client_id are required.");
    const tokens = await rotateRefreshToken(refresh_token, client_id);
    if (!tokens) return err("invalid_grant", "Refresh token is invalid, expired, or revoked.");
    return NextResponse.json({ token_type: "Bearer", ...tokens }, { headers: OAUTH_CORS });
  }

  return err("unsupported_grant_type", `grant_type '${grantType}' is not supported.`);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}
