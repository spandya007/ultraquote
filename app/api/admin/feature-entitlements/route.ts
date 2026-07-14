import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanKey, isFeatureKey } from "@/lib/billing/features";

// Platform admin toggles one cell of the feature×plan entitlements matrix.
// Body: { plan, feature_key, enabled }. See docs/integrations-phase-a-plan.md (A1).
export async function PATCH(request: NextRequest) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { plan?: string; feature_key?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { plan, feature_key, enabled } = body;
  if (!isPlanKey(plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  if (!isFeatureKey(feature_key)) return NextResponse.json({ error: "Invalid feature" }, { status: 400 });
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("plan_features").upsert(
    { plan, feature_key, enabled, updated_at: new Date().toISOString(), updated_by: adminUser.id },
    { onConflict: "plan,feature_key" }
  );
  if (error) {
    console.error("feature-entitlements update failed:", error);
    return NextResponse.json({ error: "Failed to update entitlement" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, plan, feature_key, enabled });
}
