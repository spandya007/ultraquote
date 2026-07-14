import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/user-context";
import { userHasFeature } from "@/lib/billing/entitlements";
import { exchangeCodeForTokens } from "@/lib/integrations/qbo/oauth";
import { QBO_SCOPE } from "@/lib/integrations/qbo/config";
import { verifyState } from "@/lib/integrations/oauth-state";
import { saveConnection } from "@/lib/integrations/store";

export const runtime = "nodejs";

// QBO OAuth callback: verify the signed state, re-auth the session user against
// it, exchange the code, and persist the (encrypted) tokens + realmId.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?integration=${q}`, request.url));

  if (url.searchParams.get("error")) return settings("qbo_error");
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const stateParam = url.searchParams.get("state");
  if (!code || !realmId || !stateParam) return settings("qbo_error");

  const state = verifyState<{ tenantId: string; uid: string }>(stateParam);
  if (!state) return settings("qbo_state_error");

  // Re-auth: the callback must be the same owner who started the flow.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== state.uid) return settings("forbidden");
  const ctx = await getUserContext(user.id);
  if (!ctx || ctx.role !== "owner" || ctx.tenant_id !== state.tenantId) return settings("forbidden");
  if (!(await userHasFeature(user.id, "integrations"))) return settings("not_entitled");

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await saveConnection({
      tenantId: state.tenantId,
      provider: "qbo",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      accountRef: realmId,
      scopes: QBO_SCOPE,
      connectedBy: user.id,
    });
  } catch (e) {
    console.error("[qbo] callback exchange failed:", e);
    return settings("qbo_error");
  }
  return settings("qbo_connected");
}
