import { createAdminClient } from "@/lib/supabase/admin";
import type { TenantInvite, UserRole } from "@/types";

// Shared invite mechanics for tenant-owner invites (/api/admin) and team-member
// invites (/api/team). All of this runs with the service-role client; callers
// are responsible for authorization (platform admin / tenant owner checks).
//
// How an invite works (see docs/tenant-onboarding-design.md):
// inviteUserByEmail inserts the auth user immediately (unconfirmed) with
// tenant_id/role metadata; the handle_new_auth_user trigger creates the
// public.users row from that metadata. The emailed link lands on
// /api/auth/callback → /auth/set-password, where the user sets a password.

export function inviteRedirectUrl(requestOrigin: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;
  return `${base.replace(/\/$/, "")}/api/auth/callback?next=/auth/set-password`;
}

export async function sendInviteEmail(opts: {
  email: string;
  fullName: string | null;
  tenantId: string;
  role: UserRole;
  origin: string;
}): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(opts.email, {
    data: { tenant_id: opts.tenantId, role: opts.role, full_name: opts.fullName },
    redirectTo: inviteRedirectUrl(opts.origin),
  });
  return error ? { error: error.message } : {};
}

// The trigger created a public.users row whose id IS the invited auth uid.
async function findInviteAuthUser(invite: TenantInvite) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("users")
    .select("id")
    .eq("tenant_id", invite.tenant_id)
    .ilike("email", invite.email)
    .maybeSingle();
  if (!row) return null;
  const { data } = await admin.auth.admin.getUserById(row.id);
  return data?.user ?? null;
}

function hasAccepted(authUser: { email_confirmed_at?: string | null; last_sign_in_at?: string | null }) {
  return Boolean(authUser.email_confirmed_at || authUser.last_sign_in_at);
}

// Supabase can't re-send an invite to an existing auth user, so resend =
// delete the still-unconfirmed auth user (and its users row) and invite again
// with the same metadata.
export async function resendInvite(invite: TenantInvite, origin: string): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const authUser = await findInviteAuthUser(invite);
  if (authUser) {
    if (hasAccepted(authUser)) return { error: "Invite was already accepted — nothing to resend." };
    const { error: delErr } = await admin.auth.admin.deleteUser(authUser.id);
    if (delErr) return { error: delErr.message };
    await admin.from("users").delete().eq("id", authUser.id);
  }

  const sent = await sendInviteEmail({
    email: invite.email,
    fullName: invite.full_name,
    tenantId: invite.tenant_id,
    role: invite.role,
    origin,
  });
  if (sent.error) return sent;

  await admin
    .from("tenant_invites")
    .update({ status: "pending", created_at: new Date().toISOString(), accepted_at: null })
    .eq("id", invite.id);
  return {};
}

export async function revokeInvite(invite: TenantInvite): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const authUser = await findInviteAuthUser(invite);
  if (authUser) {
    if (hasAccepted(authUser)) return { error: "Invite was already accepted — it can no longer be revoked." };
    const { error: delErr } = await admin.auth.admin.deleteUser(authUser.id);
    if (delErr) return { error: delErr.message };
    await admin.from("users").delete().eq("id", authUser.id);
  }

  await admin.from("tenant_invites").update({ status: "revoked" }).eq("id", invite.id);
  return {};
}
