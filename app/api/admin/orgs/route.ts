import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list all organizations with rollup counts (Platform Admin only).
export async function GET() {
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, slug, platform_enabled, created_at")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rollup: workspace count and admin count per org.
  const [tenantsRes, adminsRes] = await Promise.all([
    admin.from("tenants").select("id, organization_id").not("organization_id", "is", null),
    admin.from("organization_admins").select("org_id, user_id"),
  ]);
  const tenants = tenantsRes.data ?? [];
  const admins = adminsRes.data ?? [];

  const rows = (orgs ?? []).map((o) => ({
    ...o,
    workspace_count: tenants.filter((t) => t.organization_id === o.id).length,
    admin_count: admins.filter((a) => a.org_id === o.id).length,
  }));

  return NextResponse.json({ orgs: rows });
}

// POST — create a new organization (Platform Admin only).
export async function POST(req: NextRequest) {
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "Organization name is required." }, { status: 400 });

  const slug = (body.slug as string | undefined)?.trim().toLowerCase().replace(/\s+/g, "-") || null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .insert({ name, slug })
    .select("id, name, slug, platform_enabled, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ org: data }, { status: 201 });
}
