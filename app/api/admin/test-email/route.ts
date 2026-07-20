import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { mailerConfig, sendMail } from "@/lib/email/mailer";
import { ENTITY } from "@/lib/legal/entity";

// Platform-admin only: send a test email and report the exact result/error so
// SMTP misconfiguration can be diagnosed from the browser (instead of digging
// through serverless logs). Used by the /admin Beta signups card.
export async function POST() {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cfg = mailerConfig();
  // What the running function actually sees — exposes the Netlify scoping issue.
  const env = {
    SMTP_USER: Boolean(process.env.SMTP_USER),
    SMTP_PASS: Boolean(process.env.SMTP_PASS),
    SMTP_HOST: process.env.SMTP_HOST || "(default smtp.zoho.com)",
    SMTP_PORT: process.env.SMTP_PORT || "(default 465)",
    // Proves whether the runtime can see Netlify vars AT ALL: this one is set by
    // Netlify automatically on every build/function. If it's false too, the
    // function isn't getting Netlify env at all.
    NETLIFY: Boolean(process.env.NETLIFY),
    user: process.env.SMTP_USER || null,
  };

  if (!cfg.configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message:
        "The running function sees SMTP_USER/SMTP_PASS as empty. They're set in Netlify but not reaching the serverless runtime — check the variable Scopes include 'Functions'/'Runtime' and the Production deploy context.",
      env,
      config: cfg,
    });
  }

  const to = process.env.BETA_NOTIFY_TO || ENTITY.contactEmail;
  try {
    await sendMail({
      to,
      subject: "UltraQuote — SMTP test email ✅",
      text:
        `This is a test email from the UltraQuote /admin diagnostic.\n\n` +
        `If you're reading this, beta-signup notifications will be delivered.\n\n` +
        `Host: ${cfg.host}:${cfg.port}\nFrom: ${cfg.from}\nTo: ${to}`,
    });
    return NextResponse.json({
      ok: true,
      message: `Test email sent to ${to} via ${cfg.host}:${cfg.port}. Check the inbox (and spam).`,
      env,
      config: cfg,
    });
  } catch (e) {
    const err = e as { message?: string; code?: string; responseCode?: number; response?: string };
    return NextResponse.json({
      ok: false,
      configured: true,
      message: err.message || "Send failed.",
      detail: {
        code: err.code ?? null,
        responseCode: err.responseCode ?? null,
        response: err.response ?? null,
      },
      hint: smtpHint(err),
      env,
      config: cfg,
    });
  }
}

function smtpHint(err: { code?: string; responseCode?: number }): string {
  if (err.code === "EAUTH" || err.responseCode === 535) {
    return "Authentication failed. Check SMTP_USER is the full mailbox and SMTP_PASS is a valid Zoho app password (not the login password). The mailbox must be a real Zoho login, not just an alias.";
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") {
    return "Could not connect. This is usually the wrong data center — set SMTP_HOST to match your Zoho region (e.g. smtp.zoho.in, smtp.zoho.eu) and confirm the port (465 SSL / 587 TLS).";
  }
  if (err.responseCode === 553 || err.responseCode === 501) {
    return "The 'from' address was rejected. SMTP_FROM must equal the authenticated mailbox (SMTP_USER).";
  }
  return "Check SMTP_HOST/PORT/USER/PASS and that SMTP access is enabled for the mailbox in Zoho.";
}
