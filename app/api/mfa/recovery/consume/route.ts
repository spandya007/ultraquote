import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashRecoveryCode } from "@/lib/auth/recovery-codes";

export const runtime = "nodejs";

// POST { code }: used at the login MFA gate when the user can't use their
// authenticator. Validates an unused recovery code, marks it used, and removes
// the user's TOTP factor(s) so their (AAL1) session can proceed. They are then
// told to re-enable 2FA in Settings. Requires a logged-in (AAL1) session.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { code?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const code = body.code?.trim();
  if (!code) return NextResponse.json({ error: "Enter a recovery code" }, { status: 400 });

  const admin = createAdminClient();
  const { data: match } = await admin
    .from("mfa_recovery_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", hashRecoveryCode(code))
    .is("used_at", null)
    .maybeSingle();

  if (!match) return NextResponse.json({ error: "That recovery code is invalid or already used." }, { status: 400 });

  await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);

  // Remove the user's TOTP factor(s) via the GoTrue admin API so AAL1 suffices.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: factors } = await (supabase.auth as any).mfa.listFactors();
  const totp: { id: string }[] = factors?.totp ?? [];
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL as string).replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  for (const f of totp) {
    await fetch(`${base}/auth/v1/admin/users/${user.id}/factors/${f.id}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => {});
  }

  // Recovery codes are single-use to disable MFA; clear the rest.
  await admin.from("mfa_recovery_codes").delete().eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
