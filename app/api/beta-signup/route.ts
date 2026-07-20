import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/mailer";
import { ENTITY } from "@/lib/legal/entity";

const NOTIFY_TO = process.env.BETA_NOTIFY_TO || ENTITY.contactEmail;

// Public endpoint for the /beta landing-page form. Inserts a lead into
// beta_signups via the service-role client (the table is RLS-locked to
// service-role only). No auth required — middleware allowlists /api.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: bots fill hidden fields. Pretend success, write nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const companyName = String(body.company_name ?? "").trim();
  const contactName = String(body.contact_name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!companyName || !contactName || !email) {
    return NextResponse.json(
      { error: "Company, name, and email are required." },
      { status: 400 }
    );
  }
  // Light email sanity check (not RFC-perfect on purpose).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (companyName.length > 200 || contactName.length > 200 || message.length > 2000) {
    return NextResponse.json({ error: "One of the fields is too long." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("beta_signups").insert({
    company_name: companyName,
    contact_name: contactName,
    email,
    message: message || null,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  if (error) {
    console.error("beta-signup insert failed:", error.message);
    return NextResponse.json(
      { error: `Something went wrong. Please email ${ENTITY.contactEmail}.` },
      { status: 500 }
    );
  }

  // Best-effort notification — never block or fail the signup on email errors.
  try {
    await sendMail({
      to: NOTIFY_TO,
      replyTo: email,
      subject: `New ${ENTITY.productName} beta signup — ${companyName}`,
      text:
        `New beta signup:\n\n` +
        `Company: ${companyName}\n` +
        `Name:    ${contactName}\n` +
        `Email:   ${email}\n` +
        `Note:    ${message || "—"}\n\n` +
        `Reply to this email to reach them directly.\n` +
        `Manage signups: ${ENTITY.appUrl}/admin`,
    });
  } catch (e) {
    console.error("beta-signup notify failed:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
