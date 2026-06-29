import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { getTenantDossier } from "@/lib/admin/tenant-dossier";
import { renderTenantReport } from "@/lib/admin/tenant-report";

// Platform-admin only: a print-ready, self-contained HTML report of a tenant's
// workspace (counts + flagged items). The admin saves/prints it to PDF and
// emails it to the owner so they can export/act before a deletion. Route
// handlers don't run the /admin layout, so guard here explicitly.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dossier = await getTenantDossier(params.id);
  if (!dossier) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  return new NextResponse(renderTenantReport(dossier), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
