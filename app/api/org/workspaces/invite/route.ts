import { NextRequest, NextResponse } from "next/server";
import { getOrgAdminUser } from "@/lib/org-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/invites";
import { sendMail } from "@/lib/email/mailer";

// Notification inbox for Platform Admins (matches the beta-signup pattern).
const PLATFORM_NOTIFY_TO = process.env.PLATFORM_NOTIFY_EMAIL || "hello@ultraquote.io";

// Org Admin creates a NEW workspace inside THEIR OWN org and invites its owner.
// Body: { company_name, owner_email, owner_name? }
//
// Per Option A, the Org Admin sets NO subscription window — the new workspace
// starts unlimited (NULL end) and the Platform Admin sets the real term later.
// organization_id is forced to the caller's org (never read from the body).
// On success: records provenance (created_by_org_admin_user) + emails the
// Platform Admin inbox.
export async function POST(request: NextRequest) {
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { company_name?: string; owner_email?: string; owner_name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const companyName = body.company_name?.trim();
  const ownerEmail = body.owner_email?.trim().toLowerCase();
  const ownerName = body.owner_name?.trim() || null;

  if (!companyName || !ownerEmail) {
    return NextResponse.json({ error: "Workspace name and owner email are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return NextResponse.json({ error: "A valid owner email is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // An email can only belong to one auth user (= one workspace).
  const { data: existing } = await admin.from("users").select("id").ilike("email", ownerEmail).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "That email is already registered to a workspace." }, { status: 409 });
  }

  // Provision the ownerless shell (tenant + settings + seed categories).
  const { data: tenantId, error: provisionErr } = await admin.rpc("provision_tenant_shell", {
    p_name: companyName,
    p_email: ownerEmail,
  });
  if (provisionErr || !tenantId) {
    console.error("provision_tenant_shell failed:", provisionErr);
    return NextResponse.json({ error: "Failed to provision workspace" }, { status: 500 });
  }

  // Link to the caller's org + stamp provenance. No subscription window (Option A).
  await admin
    .from("tenants")
    .update({
      organization_id: orgAdmin.orgId,
      created_by_org_admin_user: orgAdmin.user.id,
    })
    .eq("id", tenantId);

  // Email the new owner an invite.
  const sent = await sendInviteEmail({
    email: ownerEmail,
    fullName: ownerName,
    tenantId: tenantId as string,
    role: "owner",
    origin: request.nextUrl.origin,
  });
  if (sent.error) {
    await admin.from("tenants").delete().eq("id", tenantId); // no orphan shell
    return NextResponse.json({ error: `Invite failed: ${sent.error}` }, { status: 502 });
  }

  await admin.from("tenant_invites").insert({
    tenant_id: tenantId,
    email: ownerEmail,
    full_name: ownerName,
    role: "owner",
    invited_by: orgAdmin.user.id,
    status: "pending",
  });

  // Notify the Platform Admin inbox (push). Non-fatal if email isn't configured.
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgAdmin.orgId).maybeSingle();
  const orgName = org?.name ?? "an organization";
  const actor = orgAdmin.user.email ?? orgAdmin.user.id;
  try {
    await sendMail({
      to: PLATFORM_NOTIFY_TO,
      subject: `New workspace "${companyName}" added to ${orgName} by an Org Admin`,
      text:
        `An Org Admin added a new workspace.\n\n` +
        `Workspace: ${companyName}\n` +
        `Organization: ${orgName}\n` +
        `Owner invited: ${ownerEmail}${ownerName ? ` (${ownerName})` : ""}\n` +
        `Added by Org Admin: ${actor}\n\n` +
        `It has NO subscription window yet — set its term in the Platform Admin console (/admin).`,
    });
  } catch (e) {
    console.error("org-workspace notify email failed:", e);
  }

  return NextResponse.json({ ok: true, tenant_id: tenantId });
}
