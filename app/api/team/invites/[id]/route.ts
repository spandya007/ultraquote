import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendInvite, revokeInvite } from "@/lib/invites";
import type { TenantInvite } from "@/types";

// Tenant-owner actions on their own tenant's invites: { action: "resend" | "revoke" }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
  if (!caller || caller.role !== "owner") {
    return NextResponse.json({ error: "Only the tenant owner can manage invites" }, { status: 403 });
  }

  let body: { action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("tenant_invites")
    .select("*")
    .eq("id", params.id)
    .eq("tenant_id", caller.tenant_id)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  if (body.action === "resend") {
    const result = await resendInvite(invite as TenantInvite, request.nextUrl.origin);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "revoke") {
    const result = await revokeInvite(invite as TenantInvite);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
