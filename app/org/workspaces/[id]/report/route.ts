import { NextResponse } from "next/server";
import { getOrgAdminUser } from "@/lib/org-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantDossier } from "@/lib/admin/tenant-dossier";
import { renderTenantReport } from "@/lib/admin/tenant-report";

// Org Admin: the same print-ready workspace report as the Platform Admin's, but
// guarded by getOrgAdminUser and hard-scoped to the caller's org so an Org Admin
// can only pull reports for their own workspaces. Route handlers don't run the
// /org layout, so guard here explicitly.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Scope check before exposing any tenant data.
  const { data: tenant } = await createAdminClient()
    .from("tenants")
    .select("id, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!tenant || tenant.organization_id !== orgAdmin.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dossier = await getTenantDossier(params.id);
  if (!dossier) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // Oversight tier: count yes, product list no.
  return new NextResponse(renderTenantReport(dossier, { hideProductDetail: true }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
