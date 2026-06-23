import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTenantDossier } from "@/lib/admin/tenant-dossier";
import { TenantDossierView } from "@/components/admin/tenant-dossier-view";

export const dynamic = "force-dynamic";

// Platform-admin tenant detail / pre-deletion dossier. The /admin layout already
// guards platform admins, so no extra auth check here.
export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  const dossier = await getTenantDossier(params.id);
  if (!dossier) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> All tenants
      </Link>
      <TenantDossierView dossier={dossier} tenantId={params.id} />
    </div>
  );
}
