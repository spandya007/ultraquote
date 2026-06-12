import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/auth/recovery-codes";

export const runtime = "nodejs";

// POST: (re)generate recovery codes for the current user, store hashes, and
// return the plaintext codes ONCE. Called right after a successful TOTP enroll,
// or via "Regenerate" in Settings.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const codes = generateRecoveryCodes();

  await admin.from("mfa_recovery_codes").delete().eq("user_id", user.id);
  const { error } = await admin
    .from("mfa_recovery_codes")
    .insert(codes.map((c) => ({ user_id: user.id, code_hash: hashRecoveryCode(c) })));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ codes });
}

// DELETE: clear the user's recovery codes (called when 2FA is disabled).
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await createAdminClient().from("mfa_recovery_codes").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

// GET: how many unused recovery codes remain (for the Settings card).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("used_at", null);

  return NextResponse.json({ remaining: count ?? 0 });
}
