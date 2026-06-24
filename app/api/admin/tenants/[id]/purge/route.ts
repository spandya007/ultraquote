import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeTenant } from "@/lib/admin/purge-tenant";

// Platform-admin only: immediately and permanently purge a tenant (override the
// grace window). Requires the exact tenant name as confirmation. Irreversible.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { confirmName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: tenant } = await admin.from("tenants").select("name").eq("id", params.id).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  if ((body.confirmName ?? "").trim() !== (tenant.name ?? "").trim()) {
    return NextResponse.json({ error: "The typed name does not match the tenant name." }, { status: 400 });
  }

  try {
    const result = await purgeTenant(params.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("purge failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Purge failed. Check logs." }, { status: 500 });
  }
}
