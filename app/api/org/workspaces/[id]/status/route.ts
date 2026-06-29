import { NextRequest, NextResponse } from "next/server";
import { getOrgAdminUser } from "@/lib/org-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Org Admin kill switch: suspend / re-enable a workspace IN THEIR OWN ORG.
// Body: { enabled: boolean, reason?: string }
//
// Mirrors the platform route (/api/admin/tenants/[id]/status) but:
//  - guarded by getOrgAdminUser() (not the platform guard), and
//  - hard-scoped: the target tenant's organization_id MUST equal the caller's
//    org, so an Org Admin can never touch a workspace outside their org.
// Per Option A, this is the ONLY lifecycle write an Org Admin can make
// (no subscription edits, no delete).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tenantId } = await params;
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { enabled?: boolean; reason?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Ownership scope: the workspace must belong to the caller's org.
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (tenant.organization_id !== orgAdmin.orgId) {
    return NextResponse.json({ error: "That workspace is not in your organization." }, { status: 403 });
  }

  // Prefix the reason so the Platform Admin can tell an Org-Admin suspension
  // apart from their own when reviewing in /admin.
  const reason = body.enabled ? null : `[Org Admin] ${body.reason?.trim() || "Suspended by Org Admin"}`;

  const { error } = await admin
    .from("tenants")
    .update({
      platform_enabled: body.enabled,
      suspended_at: body.enabled ? null : new Date().toISOString(),
      suspended_reason: reason,
    })
    .eq("id", tenantId);
  if (error) {
    console.error("org workspace status update failed:", error);
    return NextResponse.json({ error: "Failed to update workspace status" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, platform_enabled: body.enabled });
}
