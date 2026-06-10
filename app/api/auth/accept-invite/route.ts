import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called by /auth/set-password after the invited user sets their password:
// marks their pending invite(s) accepted. Service role writes the invite row
// (tenant_invites has no client write policies).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!userRow) return NextResponse.json({ ok: true }); // not an invited user — nothing to mark

  await admin
    .from("tenant_invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("tenant_id", userRow.tenant_id)
    .ilike("email", user.email)
    .eq("status", "pending");

  return NextResponse.json({ ok: true });
}
