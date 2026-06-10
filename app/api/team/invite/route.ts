import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/invites";

// Tenant owner invites a team member into their own tenant.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: caller } = await db
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "owner") {
    return NextResponse.json({ error: "Only the tenant owner can invite team members" }, { status: 403 });
  }

  let body: { email?: string; full_name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = body.email?.trim().toLowerCase();
  const fullName = body.full_name?.trim() || null;
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: existing } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "That email already has an account" }, { status: 409 });
  }

  const sent = await sendInviteEmail({
    email,
    fullName,
    tenantId: caller.tenant_id,
    role: "member",
    origin: request.nextUrl.origin,
  });
  if (sent.error) return NextResponse.json({ error: `Invite failed: ${sent.error}` }, { status: 502 });

  await admin.from("tenant_invites").insert({
    tenant_id: caller.tenant_id,
    email,
    full_name: fullName,
    role: "member",
    invited_by: user.id,
    status: "pending",
  });

  return NextResponse.json({ ok: true });
}
