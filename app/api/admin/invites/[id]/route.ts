import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resendInvite, revokeInvite } from "@/lib/invites";
import type { TenantInvite } from "@/types";

// Platform-admin actions on any invite: { action: "resend" | "revoke" }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("tenant_invites")
    .select("*")
    .eq("id", params.id)
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
