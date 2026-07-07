import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePassword } from "@/lib/auth/password";
import { sendMail } from "@/lib/email/mailer";

// Self-serve signup (pay-per-use). Creates the Auth user (unconfirmed) + a STANDALONE
// tenant (owner = the new user), and emails a confirmation link via the app's own
// SMTP (Zoho) — NOT Supabase's automatic signup email, so delivery doesn't depend on
// Supabase email config. The link lands on /auth/confirm (scanner-safe verifyOtp).
// Email verification hard-gates access. See docs/self-serve-onboarding-design.md.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  const admin = createAdminClient();

  // Create the user (unconfirmed) + generate the confirmation token WITHOUT sending
  // an email. No tenant_id in metadata → handle_new_auth_user no-ops; provision_tenant
  // creates the public.users row (design §5).
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { full_name: fullName }, redirectTo: `${origin}/auth/confirm` },
  });
  if (error || !data?.user?.id) {
    const dup = /already|registered|exists/i.test(error?.message ?? "");
    return NextResponse.json(
      { error: dup
          ? "An account with this email already exists — try signing in or resetting your password."
          : "Could not create your account. Please try again." },
      { status: 400 }
    );
  }
  const userId = data.user.id;
  const tokenHash = data.properties?.hashed_token;
  const confirmUrl = tokenHash
    ? `${origin}/auth/confirm?token_hash=${tokenHash}&type=signup`
    : data.properties?.action_link;
  if (!confirmUrl) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }

  // Provision a STANDALONE tenant (organization_id = NULL) with this user as owner.
  const { error: provErr } = await admin.rpc("provision_tenant", {
    p_name: company, p_email: email, p_owner_id: userId, p_owner_email: email, p_owner_name: fullName,
  });
  if (provErr) {
    console.error("[signup] provision_tenant failed:", provErr);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not set up your workspace. Please try again." }, { status: 500 });
  }

  // Send the confirmation email via the app's SMTP.
  const { sent } = await sendMail({
    to: email,
    subject: "Confirm your UltraQuote account",
    text:
      `Welcome to UltraQuote, ${fullName}!\n\n` +
      `Confirm your email to activate your workspace:\n${confirmUrl}\n\n` +
      `If you didn't sign up, you can ignore this email.`,
    html:
      `<p>Welcome to UltraQuote, ${esc(fullName)}!</p>` +
      `<p>Confirm your email to activate your workspace:</p>` +
      `<p><a href="${confirmUrl}">Confirm my account</a></p>` +
      `<p style="color:#64748b;font-size:12px">If you didn't sign up, you can ignore this email.</p>`,
  });
  if (!sent) console.warn("[signup] confirmation email not sent — SMTP not configured?");

  return NextResponse.json({ ok: true, emailed: sent });
}
