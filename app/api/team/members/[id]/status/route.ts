import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Tenant→user kill switch (req #6): a tenant owner enables/disables a MEMBER of
// their own tenant. Owners can't be disabled, and you can't disable yourself.
// Body: { enabled: boolean }
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { enabled?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Caller must be an owner.
  const { data: caller } = await admin
    .from("users").select("tenant_id, role").eq("id", user.id).maybeSingle();
  if (!caller || caller.role !== "owner") {
    return NextResponse.json({ error: "Only the account owner can change member access" }, { status: 403 });
  }
  if (params.id === user.id) {
    return NextResponse.json({ error: "You can't change your own access" }, { status: 400 });
  }

  // Target must be a member of the SAME tenant (never an owner).
  const { data: target } = await admin
    .from("users").select("tenant_id, role").eq("id", params.id).maybeSingle();
  if (!target || target.tenant_id !== caller.tenant_id) {
    return NextResponse.json({ error: "User not found in your team" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "The owner can't be disabled" }, { status: 400 });
  }

  const { error } = await admin
    .from("users")
    .update({
      enabled: body.enabled,
      disabled_at: body.enabled ? null : new Date().toISOString(),
      disabled_by: body.enabled ? null : user.id,
    })
    .eq("id", params.id);
  if (error) {
    console.error("member status update failed:", error);
    return NextResponse.json({ error: "Failed to update member access" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
