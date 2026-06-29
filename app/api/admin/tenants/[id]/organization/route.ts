import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH — assign or remove an Organization from a Workspace (Platform Admin only).
// Body: { org_id: string | null }  — null removes the tenant from any org (standalone).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: tenantId } = await params;
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  // org_id can be a UUID string or null to remove.
  const orgId = (body.org_id as string | null | undefined) ?? null;

  const admin = createAdminClient();

  // Verify org exists when setting (skip for null).
  if (orgId) {
    const { data: org } = await admin.from("organizations").select("id").eq("id", orgId).maybeSingle();
    if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  const { error } = await admin
    .from("tenants")
    .update({ organization_id: orgId })
    .eq("id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
