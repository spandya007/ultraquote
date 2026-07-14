import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/user-context";
import { userHasFeature } from "@/lib/billing/entitlements";
import { isQboConfigured } from "@/lib/integrations/qbo/config";
import { buildAuthorizeUrl } from "@/lib/integrations/qbo/oauth";
import { signState } from "@/lib/integrations/oauth-state";

export const runtime = "nodejs";

// Starts the QBO OAuth flow: owner + 'integrations' entitlement required, then
// redirect to Intuit's consent screen with a signed state. The callback re-checks
// the session user owns the tenant in the state. docs/integrations-phase-a-plan.md (A3).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const ctx = await getUserContext(user.id);
  if (!ctx || ctx.role !== "owner") {
    return NextResponse.redirect(new URL("/settings?integration=forbidden", request.url));
  }
  if (!(await userHasFeature(user.id, "integrations"))) {
    return NextResponse.redirect(new URL("/settings?integration=not_entitled", request.url));
  }
  if (!isQboConfigured()) {
    return NextResponse.redirect(new URL("/settings?integration=qbo_unconfigured", request.url));
  }

  const state = signState({ tenantId: ctx.tenant_id, uid: user.id, provider: "qbo" });
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
