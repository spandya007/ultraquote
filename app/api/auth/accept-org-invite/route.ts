import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — complete Org Admin onboarding after set-password.
// Called by the set-password form when user metadata contains type='org_admin'.
// Creates the organization_admins row and marks the invite accepted.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meta = user.user_metadata ?? {};
  const orgId = meta.org_id as string | undefined;
  if (!meta.type || meta.type !== "org_admin" || !orgId) {
    return NextResponse.json({ error: "Not an org admin invite." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotent: insert only if not already there.
  await admin
    .from("organization_admins")
    .upsert({ org_id: orgId, user_id: user.id }, { onConflict: "org_id,user_id", ignoreDuplicates: true });

  // Mark the invite accepted and clear the pending auth user id.
  await admin
    .from("org_admin_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), invited_auth_user_id: null })
    .eq("org_id", orgId)
    .ilike("email", user.email ?? "")
    .eq("status", "pending");

  return NextResponse.json({ ok: true });
}
