import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOrgAdminUser } from "@/lib/org-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantDossier } from "@/lib/admin/tenant-dossier";
import { TenantDossierView } from "@/components/admin/tenant-dossier-view";

export const dynamic = "force-dynamic";

// Org Admin read-only workspace detail (dossier). Same data the Platform Admin
// sees, but: (1) guarded by getOrgAdminUser, (2) hard-scoped to the caller's
// org, and (3) NO danger zone — Org Admins can't delete (Oversight tier).
export default async function OrgWorkspaceDetailPage({ params }: { params: { id: string } }) {
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) redirect("/");

  // Scope check: the workspace must belong to the caller's org.
  const { data: tenant } = await createAdminClient()
    .from("tenants")
    .select("id, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!tenant || tenant.organization_id !== orgAdmin.orgId) notFound();

  const dossier = await getTenantDossier(params.id);
  if (!dossier) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/org"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> All workspaces
      </Link>
      <TenantDossierView
        dossier={dossier}
        tenantId={params.id}
        reportHref={`/org/workspaces/${params.id}/report`}
        hideProductDetail
      />
    </div>
  );
}
