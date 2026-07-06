import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassword } from "@/lib/auth/password";

// Self-serve signup (pay-per-use). Creates the Auth user + sends the confirmation
// email, then auto-provisions a STANDALONE tenant (owner = the new user) via
// provision_tenant. No admin, no org. Email verification hard-gates access
// (requires "Confirm email" ON in Supabase Auth). See
// docs/self-serve-onboarding-design.md.
export async function POST(request: Request) {
  let body: { fullName?: string; company?: string; email?: string; password?: string; website?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  // Honeypot: bots fill the hidden field — pretend success, do nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true });

  const fullName = (body.fullName ?? "").trim();
  const company = (body.company ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!fullName || !company || !email) {
    return NextResponse.json({ error: "Name, company, and email are all required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const pwErr = validatePassword(password, email);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const origin = new URL(request.url).origin;
  const supabase = await createClient();

  // Create the auth user (unconfirmed) + send the confirmation email. No tenant_id
  // in metadata → the handle_new_auth_user trigger no-ops; provision_tenant makes
  // the public.users row itself. (See design §5.)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    const dup = /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      { error: dup
          ? "An account with this email already exists — try signing in or resetting your password."
          : "Could not create your account. Please try again." },
      { status: 400 }
    );
  }

  // Supabase obfuscates an existing (confirmed) email by returning a user with an
  // empty identities array and NO error. Don't provision a duplicate; return a
  // generic success so we don't leak which emails are registered.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return NextResponse.json({ ok: true });
  }
  const userId = data.user?.id;
  if (!userId) return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });

  // Provision a STANDALONE tenant (organization_id = NULL) with this user as owner.
  const admin = createAdminClient();
  const { error: provErr } = await admin.rpc("provision_tenant", {
    p_name: company,
    p_email: email,
    p_owner_id: userId,
    p_owner_email: email,
    p_owner_name: fullName,
  });
  if (provErr) {
    console.error("[signup] provision_tenant failed:", provErr);
    // Remove the orphan auth user so the person can retry cleanly.
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not set up your workspace. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
