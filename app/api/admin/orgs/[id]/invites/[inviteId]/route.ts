import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteRedirectUrl } from "@/lib/invites";

// PATCH — resend or revoke an Org Admin invite.
// Body: { action: "resend" | "revoke" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const { id: orgId, inviteId } = await params;
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as "resend" | "revoke" | undefined;
  if (action !== "resend" && action !== "revoke") {
    return NextResponse.json({ error: "action must be 'resend' or 'revoke'." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("org_admin_invites")
    .select("id, org_id, email, full_name, status, invited_auth_user_id")
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  if (invite.status === "accepted") {
    return NextResponse.json({ error: "Invite was already accepted." }, { status: 409 });
  }

  // Delete the pending auth user so we can re-invite with a fresh link.
  // Use the stored user_id if available; fall back to an email lookup.
  if (invite.invited_auth_user_id) {
    await admin.auth.admin.deleteUser(invite.invited_auth_user_id);
  }

  if (action === "revoke") {
    await admin
      .from("org_admin_invites")
      .update({ status: "revoked", invited_auth_user_id: null })
      .eq("id", inviteId);
    return NextResponse.json({ ok: true });
  }

  // resend — re-invite with the same metadata.
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data: newInviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(invite.email, {
    data: {
      type: "org_admin",
      org_id: orgId,
      full_name: invite.full_name,
      org_name: org?.name ?? null,
    },
    redirectTo: inviteRedirectUrl(origin),
  });
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  await admin
    .from("org_admin_invites")
    .update({
      status: "pending",
      created_at: new Date().toISOString(),
      accepted_at: null,
      invited_auth_user_id: newInviteData?.user?.id ?? null,
    })
    .eq("id", inviteId);

  return NextResponse.json({ ok: true });
}
