import nodemailer, { type Transporter } from "nodemailer";

// Lightweight transactional mailer over the existing Zoho SMTP account.
// Env (set in Netlify + .env.local):
//   SMTP_USER  — the authenticated mailbox (e.g. hello@ultraquote.io)
//   SMTP_PASS  — a Zoho app password for that mailbox
//   SMTP_HOST  — optional, defaults to smtp.zoho.com
//   SMTP_PORT  — optional, defaults to 465 (SSL)
//   SMTP_FROM  — optional, defaults to SMTP_USER (Zoho requires from == mailbox)
// If SMTP_USER/SMTP_PASS are missing, sendMail no-ops (logs a warning) so callers
// never break when email isn't configured (e.g. local dev).

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.zoho.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

// Non-secret view of the mailer config, for the /admin diagnostic. Never
// returns the password — only whether it's present.
export function mailerConfig() {
  const user = process.env.SMTP_USER || null;
  return {
    configured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    host: process.env.SMTP_HOST || "smtp.zoho.com",
    port: Number(process.env.SMTP_PORT || 465),
    user,
    from: process.env.SMTP_FROM || user,
    passPresent: Boolean(process.env.SMTP_PASS),
  };
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<{ sent: boolean }> {
  const t = getTransporter();
  if (!t) {
    console.warn(`SMTP not configured — skipping email: "${opts.subject}"`);
    return { sent: false };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  await t.sendMail({ from, ...opts });
  return { sent: true };
}
