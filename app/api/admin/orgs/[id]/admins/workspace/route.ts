import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Platform Admin: make an Org Admin ALSO the Owner of one workspace in their org
// (a deliberate dual-hat), or remove that membership.
// Body: { user_id: string, tenant_id: string | null }  (null = un-assign)
//
// Hard rules:
//  - the Org Admin must belong to org [id]
//  - the target workspace must belong to org [id] (never cross-org)
//  - ONE workspace per login (users.id is PK) — can't assign a second
//  - removing must not orphan a workspace (refuse if sole owner)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = body.user_id as string | undefined;
  const tenantId = (body.tenant_id as string | null | undefined) ?? null;
  if (!userId) return NextResponse.json({ error: "user_id is required." }, { status: 400 });

  const admin = createAdminClient();

  // The user must be an Org Admin of THIS org.
  const { data: orgAdminRow } = await admin
    .from("organization_admins")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!orgAdminRow) {
    return NextResponse.json({ error: "That user is not an Org Admin of this organization." }, { status: 404 });
  }

  // Their current workspace membership, if any (one row max — users.id is PK).
  const { data: existing } = await admin
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", userId)
    .maybeSingle();

  // ── Remove (un-assign) ──────────────────────────────────────────────────
  if (!tenantId) {
    if (!existing) return NextResponse.json({ ok: true }); // already none
    // Don't orphan a workspace: refuse if this admin is its only owner.
    if (existing.role === "owner") {
      const { count } = await admin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", existing.tenant_id)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: "This admin is the only Owner of that workspace — assign another owner before removing." },
          { status: 409 }
        );
      }
    }
    const { error } = await admin.from("users").delete().eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Assign ──────────────────────────────────────────────────────────────
  // One workspace per login: if they already belong to a different workspace,
  // require removing that first (we never silently move them and orphan it).
  if (existing && existing.tenant_id !== tenantId) {
    return NextResponse.json(
      { error: "This admin already operates another workspace. Remove that first, then assign." },
      { status: 409 }
    );
  }

  // The target workspace must be in THIS org (never cross-org).
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, organization_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (tenant.organization_id !== orgId) {
    return NextResponse.json({ error: "That workspace is not in this organization." }, { status: 403 });
  }

  // Resolve the auth user's email/name for the users row.
  const { data: authRes } = await admin.auth.admin.getUserById(userId);
  const email = authRes?.user?.email;
  if (!email) return NextResponse.json({ error: "Could not resolve the admin's email." }, { status: 500 });
  const fullName = (authRes?.user?.user_metadata?.full_name as string | null) ?? null;

  // Create (or no-op if already this workspace) the owner membership.
  const { error } = await admin
    .from("users")
    .upsert({ id: userId, tenant_id: tenantId, email, full_name: fullName, role: "owner" }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
