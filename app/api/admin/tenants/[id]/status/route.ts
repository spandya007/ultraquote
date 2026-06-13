import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Platform kill switch: enable/disable an entire tenant (all users incl. owner),
// regardless of subscription dates. Body: { enabled: boolean, reason?: string }
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { enabled?: boolean; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tenants")
    .update({
      platform_enabled: body.enabled,
      suspended_at: body.enabled ? null : new Date().toISOString(),
      suspended_reason: body.enabled ? null : (body.reason?.trim() || null),
    })
    .eq("id", params.id);
  if (error) {
    console.error("tenant status update failed:", error);
    return NextResponse.json({ error: "Failed to update tenant status" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, platform_enabled: body.enabled });
}
