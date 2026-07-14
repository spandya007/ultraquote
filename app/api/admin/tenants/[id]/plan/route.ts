import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlanKey } from "@/lib/billing/features";

// Platform admin sets a tenant's subscription plan (tier). Admin-set for now
// (no Stripe). See docs/integrations-phase-a-plan.md (A1). Body: { plan }.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isPlanKey(body.plan)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("tenants").update({ plan: body.plan }).eq("id", params.id);
  if (error) {
    console.error("tenant plan update failed:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, plan: body.plan });
}
