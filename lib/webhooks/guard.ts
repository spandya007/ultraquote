import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/user-context";
import { userHasFeature } from "@/lib/billing/entitlements";

// Owner + 'integrations' entitlement gate for the webhook-management routes —
// same posture as the QBO connect/disconnect routes. Returns the tenant/user on
// success, or a ready-to-return NextResponse on failure.
export async function requireWebhookOwner(): Promise<
  { tenantId: string; userId: string } | { response: NextResponse }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const ctx = await getUserContext(user.id);
  if (!ctx || ctx.role !== "owner") {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!(await userHasFeature(user.id, "integrations"))) {
    return { response: NextResponse.json({ error: "Your plan does not include integrations." }, { status: 403 }) };
  }
  return { tenantId: ctx.tenant_id, userId: user.id };
}
