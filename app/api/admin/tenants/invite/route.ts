import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/invites";
import { computeEndDate, todayIso } from "@/lib/access/subscription";
import type { SubscriptionTerm } from "@/types";

const TERMS: SubscriptionTerm[] = ["monthly", "quarterly", "yearly", "custom"];

// Platform admin invites a new MSP tenant: provision an ownerless tenant shell
// (tenant + settings + seed categories), then email a Supabase invite carrying
// tenant_id/role metadata — the handle_new_auth_user trigger links the owner.
export async function POST(request: NextRequest) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    company_name?: string; contact_email?: string; owner_email?: string; owner_name?: string;
    subscription_term?: string; subscription_end?: string; organization_id?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const companyName = body.company_name?.trim();
  const ownerEmail = body.owner_email?.trim().toLowerCase();
  const contactEmail = body.contact_email?.trim() || ownerEmail;
  const ownerName = body.owner_name?.trim() || null;
  // Optional: create this workspace already linked to an organization.
  const organizationId = body.organization_id?.trim() || null;

  if (!companyName || !ownerEmail) {
    return NextResponse.json({ error: "Company name and owner email are required" }, { status: 400 });
  }

  // Subscription set at invite time (D3b): the clock starts on the invite-send
  // date (today). Term is optional — blank/none leaves the tenant Unlimited.
  const subStart = todayIso();
  const subTerm = (body.subscription_term?.trim() || "") as SubscriptionTerm | "";
  let subEnd: string | null = null;
  if (subTerm) {
    if (!TERMS.includes(subTerm)) {
      return NextResponse.json({ error: "Invalid subscription term" }, { status: 400 });
    }
    if (subTerm === "custom") {
      subEnd = body.subscription_end?.trim() || null;
      if (!subEnd || !/^\d{4}-\d{2}-\d{2}$/.test(subEnd)) {
        return NextResponse.json({ error: "A custom term requires an end date" }, { status: 400 });
      }
      if (subEnd < subStart) {
        return NextResponse.json({ error: "End date cannot be before today" }, { status: 400 });
      }
    } else {
      subEnd = computeEndDate(subStart, subTerm);
    }
  }

  const admin = createAdminClient();

  // An email can only belong to one auth user (= one tenant). Attaching an
  // existing account to a new tenant is a deliberate manual operation.
  const { data: existing } = await admin.from("users").select("id").ilike("email", ownerEmail).maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That email is already registered to a tenant — see docs/manual-tenant-onboarding.md to move it." },
      { status: 409 }
    );
  }

  // If linking to an org, verify it exists first (fail before provisioning).
  if (organizationId) {
    const { data: org } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { data: tenantId, error: provisionErr } = await admin.rpc("provision_tenant_shell", {
    p_name: companyName,
    p_email: contactEmail,
  });
  if (provisionErr || !tenantId) {
    console.error("provision_tenant_shell failed:", provisionErr);
    return NextResponse.json({ error: "Failed to provision tenant" }, { status: 500 });
  }

  // Stamp the subscription window on the shell (clock starts now, D3b) +
  // optionally link it to an organization.
  await admin
    .from("tenants")
    .update({
      subscription_start: subStart,
      subscription_term: subTerm || null,
      subscription_end: subEnd,
      organization_id: organizationId,
    })
    .eq("id", tenantId);

  const sent = await sendInviteEmail({
    email: ownerEmail,
    fullName: ownerName,
    tenantId: tenantId as string,
    role: "owner",
    origin: request.nextUrl.origin,
  });
  if (sent.error) {
    // Don't leave an orphan shell tenant behind.
    await admin.from("tenants").delete().eq("id", tenantId);
    return NextResponse.json({ error: `Invite failed: ${sent.error}` }, { status: 502 });
  }

  await admin.from("tenant_invites").insert({
    tenant_id: tenantId,
    email: ownerEmail,
    full_name: ownerName,
    role: "owner",
    invited_by: adminUser.id,
    status: "pending",
  });

  return NextResponse.json({ ok: true, tenant_id: tenantId });
}
