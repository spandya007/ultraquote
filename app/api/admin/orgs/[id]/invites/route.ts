import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list Org Admin invites for a given organization (Platform Admin only).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("org_admin_invites")
    .select("id, email, full_name, status, created_at, accepted_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}
