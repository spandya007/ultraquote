import { NextRequest, NextResponse } from "next/server";
import { getOrgAdminUser } from "@/lib/org-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Org Admin sets the ORG-DEFAULT Proposal Voice for their own organization.
// These defaults apply to every workspace in the org UNLESS that workspace sets
// its own (Settings → Proposal Voice); getBrandProfile() resolves
// tenant → org default → neutral. organizations has RLS with no policies, so the
// write goes through the service-role admin client after the org-admin guard.
// Body: { businessType?, businessAbout?, brandVoice? } — empty strings clear a field.
export async function PATCH(request: NextRequest) {
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { businessType?: string | null; businessAbout?: string | null; brandVoice?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const norm = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t.length ? t : null;
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      default_business_type:  norm(body.businessType),
      default_business_about: norm(body.businessAbout),
      default_brand_voice:    norm(body.brandVoice),
    })
    .eq("id", orgAdmin.orgId);

  if (error) {
    console.error("org voice update failed:", error);
    return NextResponse.json({ error: "Failed to save org voice" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
