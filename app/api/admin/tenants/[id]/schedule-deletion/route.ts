import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { DELETION_GRACE_DAYS } from "@/lib/admin/purge-tenant";

// Platform-admin only. POST schedules a tenant for deletion after the grace
// window (type-the-name confirm); DELETE cancels a scheduled deletion.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { confirmName?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: tenant } = await admin
    .from("tenants")
    .select("name, deletion_scheduled_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  // Confirm the admin typed the exact tenant name.
  if ((body.confirmName ?? "").trim() !== (tenant.name ?? "").trim()) {
    return NextResponse.json({ error: "The typed name does not match the tenant name." }, { status: 400 });
  }

  const scheduledAt = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("tenants")
    .update({
      deletion_scheduled_at: scheduledAt,
      deletion_requested_by: adminUser.id,
      deletion_reason: (body.reason ?? "").trim() || null,
    })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, deletion_scheduled_at: scheduledAt, grace_days: DELETION_GRACE_DAYS });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin
    .from("tenants")
    .update({ deletion_scheduled_at: null, deletion_requested_by: null, deletion_reason: null })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
