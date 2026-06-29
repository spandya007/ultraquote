import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteRedirectUrl } from "@/lib/invites";

// POST — invite a new Org Admin to the given organization.
// Sends an invite email (same /auth/set-password landing page). The invitee
// has NO tenant_id in their metadata, so handle_new_auth_user creates no
// public.users row; instead the Org Admin row is created on accept-org-invite.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.trim().toLowerCase();
  const fullName = (body.full_name as string | undefined)?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the org exists.
  const { data: org } = await admin.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  // Don't duplicate a pending invite to the same org.
  const { data: existing } = await admin
    .from("org_admin_invites")
    .select("id, status")
    .eq("org_id", orgId)
    .ilike("email", email)
    .maybeSingle();
  if (existing?.status === "pending") {
    return NextResponse.json({ error: "A pending invite already exists for that email." }, { status: 409 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      type: "org_admin",
      org_id: orgId,
      full_name: fullName,
      org_name: org.name,
    },
    redirectTo: inviteRedirectUrl(origin),
  });
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  // Track the invite (upsert in case there was a revoked one).
  const { data: invite, error: trackErr } = await admin
    .from("org_admin_invites")
    .upsert(
      {
        org_id: orgId,
        email,
        full_name: fullName,
        invited_by: admin_user.id,
        status: "pending",
        created_at: new Date().toISOString(),
        accepted_at: null,
        invited_auth_user_id: inviteData?.user?.id ?? null,
      },
      { onConflict: "org_id,email" }
    )
    .select("id, email, full_name, status, created_at")
    .single();

  if (trackErr) return NextResponse.json({ error: trackErr.message }, { status: 500 });
  return NextResponse.json({ invite }, { status: 201 });
}
