import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Platform-admin only: update a beta signup's status. Used by the /admin
// "Beta signups" card to mark a lead invited (or revert to new).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const status = body.status;
  if (status !== "new" && status !== "invited" && status !== "declined") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("beta_signups")
    .update({
      status,
      invited_at: status === "invited" ? new Date().toISOString() : null,
    })
    .eq("id", params.id);

  if (error) {
    console.error("beta-signup update failed:", error.message);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
