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

// Straight to the (public) set-password page — invite tokens arrive in the
// URL hash, so no server callback is involved. Deliberately NO query string:
// Supabase's redirect-URL allowlist matching is unreliable with query params
// (silently falls back to the Site URL), so this must stay a plain path that
// exactly matches the allowlist entries.
export function inviteRedirectUrl(requestOrigin: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin;
  return `${base.replace(/\/$/, "")}/auth/set-password`;
}

export async function sendInviteEmail(opts: {
  email: string;
  fullName: string | null;
  tenantId: string;
  role: UserRole;
  origin: string;
}): Promise<{ error?: string }> {
  const admin = createAdminClient();

  // tenant_name is metadata for the invite email template only
  // ({{ .Data.tenant_name }}); the handle_new_auth_user trigger ignores it.
  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", opts.tenantId)
    .maybeSingle();

  const { error } = await admin.auth.admin.inviteUserByEmail(opts.email, {
    data: {
      tenant_id: opts.tenantId,
      role: opts.role,
      full_name: opts.fullName,
      tenant_name: tenant?.name ?? null,
    },
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

// "Accepted" means the invitee finished set-password (our tenant_invites row
// is flipped by /api/auth/accept-invite). Deliberately NOT based on the auth
// user's email_confirmed_at/last_sign_in_at: just clicking the (single-use)
// link sets those, and a click-but-abandoned invite must stay resendable.

// Supabase can't re-send an invite to an existing auth user, so resend =
// delete the not-yet-accepted auth user (and its users row) and invite again
// with the same metadata.
export async function resendInvite(invite: TenantInvite, origin: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  if (invite.status === "accepted") {
    return { error: "Invite was already accepted — nothing to resend." };
  }

  const authUser = await findInviteAuthUser(invite);
  if (authUser) {
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
  if (invite.status === "accepted") {
    return { error: "Invite was already accepted — it can no longer be revoked." };
  }

  const authUser = await findInviteAuthUser(invite);
  if (authUser) {
    const { error: delErr } = await admin.auth.admin.deleteUser(authUser.id);
    if (delErr) return { error: delErr.message };
    await admin.from("users").delete().eq("id", authUser.id);
  }

  await admin.from("tenant_invites").update({ status: "revoked" }).eq("id", invite.id);
  return {};
}

// Re-invite to a DIFFERENT email (fix a wrong address without recreating the
// tenant). Deletes any not-yet-accepted auth user for the old email, repoints
// the invite to the new email (+ optional name), and sends a fresh invite.
export async function changeInviteEmail(
  invite: TenantInvite,
  newEmailRaw: string,
  origin: string,
  fullName?: string | null,
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  if (invite.status === "accepted") {
    return { error: "Invite was already accepted — its email can't be changed." };
  }

  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: "A valid email address is required." };
  }

  // The new email must not already belong to a tenant.
  const { data: existing } = await admin
    .from("users").select("id").ilike("email", newEmail).maybeSingle();
  if (existing) {
    return { error: "That email is already registered to a tenant." };
  }

  // Remove the not-yet-accepted auth user for the OLD email (found by the
  // invite's current email) before repointing.
  const authUser = await findInviteAuthUser(invite);
  if (authUser) {
    const { error: delErr } = await admin.auth.admin.deleteUser(authUser.id);
    if (delErr) return { error: delErr.message };
    await admin.from("users").delete().eq("id", authUser.id);
  }

  const name = fullName === undefined ? invite.full_name : (fullName?.trim() || null);
  await admin
    .from("tenant_invites")
    .update({ email: newEmail, full_name: name })
    .eq("id", invite.id);

  const sent = await sendInviteEmail({
    email: newEmail,
    fullName: name,
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
