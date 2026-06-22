"use client";

import { useState } from "react";

// Public beta-signup landing page (/beta). Self-contained: scoped CSS under
// `.uq-beta`, always light/branded. Palette: "Signal" (Blue #2563EB primary +
// Teal #0EA5A4 accent) — see marketing-materials/BRAND-PALETTE.md. The CTA band
// holds a real form that posts to /api/beta-signup (captures Company name —
// needed to send the invite — plus name + email).

const STYLES = `
.uq-beta{--brand:#2563eb;--teal:#0ea5a4;--teal-dark:#0f5f5c;--teal-50:#ecfeff;--teal-100:#ccfbf1;--ink:#0b1f3a;--muted:#475569;--line:#e2e8f0;--ok:#16a34a;color:var(--ink);line-height:1.55}
.uq-beta *{box-sizing:border-box}
.uq-beta .sheet{max-width:880px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -34px rgba(11,31,58,.45)}
.uq-beta .band{background:linear-gradient(135deg,var(--brand),var(--teal));color:#fff;padding:34px 40px 30px}
.uq-beta .logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px}
.uq-beta .logo .mark{width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.18);display:grid;place-items:center;font-weight:900;font-size:15px;color:#fff}
.uq-beta .pill{display:inline-block;margin-top:22px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);color:#fff;font-weight:700;font-size:12px;letter-spacing:.07em;text-transform:uppercase;padding:6px 14px;border-radius:999px}
.uq-beta .band h1{font-size:32px;line-height:1.12;letter-spacing:-.02em;margin:16px 0 10px;max-width:20ch}
.uq-beta .band p{font-size:15px;opacity:.95;max-width:60ch;line-height:1.5}
.uq-beta .body{padding:30px 40px 8px}
.uq-beta .lead{font-size:15.5px;line-height:1.65;color:var(--ink)}
.uq-beta .lead strong{color:var(--brand)}
.uq-beta .benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0 26px}
.uq-beta .ben{border:1px solid var(--line);border-radius:12px;padding:18px}
.uq-beta .ben .ic{width:38px;height:38px;border-radius:10px;background:var(--teal-50);display:grid;place-items:center;font-size:19px;margin-bottom:11px}
.uq-beta .ben h3{font-size:15px;margin:0 0 5px;letter-spacing:-.01em}
.uq-beta .ben p{font-size:13px;color:var(--muted);line-height:1.5;margin:0}
.uq-beta .why{background:var(--teal-50);border:1px solid var(--teal-100);border-radius:14px;padding:20px 24px;margin-bottom:26px}
.uq-beta .why h2{font-size:16px;color:var(--teal-dark);margin:0 0 12px}
.uq-beta .why ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin:0;padding:0}
.uq-beta .why li{font-size:13.5px;color:var(--ink);display:flex;gap:9px;align-items:flex-start;line-height:1.45}
.uq-beta .why li .ck{color:var(--ok);font-weight:900;font-size:13px;margin-top:1px}
.uq-beta .cta{background:var(--ink);border-radius:14px;padding:26px 28px;color:#fff;margin-bottom:26px}
.uq-beta .cta .t{font-size:18px;font-weight:800;letter-spacing:-.01em}
.uq-beta .cta .s{font-size:13px;opacity:.82;margin-top:5px;max-width:60ch}
.uq-beta form.signup{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
.uq-beta form.signup .full{grid-column:1 / -1}
.uq-beta form.signup label{display:block;font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:5px}
.uq-beta form.signup input,.uq-beta form.signup textarea{width:100%;background:#fff;border:1px solid #1e293b;border-radius:9px;padding:11px 13px;font-size:14px;color:var(--ink);font-family:inherit}
.uq-beta form.signup input:focus,.uq-beta form.signup textarea:focus{outline:2px solid var(--teal);outline-offset:1px}
.uq-beta form.signup textarea{min-height:64px;resize:vertical}
.uq-beta .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.uq-beta .submit-row{grid-column:1 / -1;display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:2px}
.uq-beta button.submit{background:#fff;color:var(--brand);font-weight:800;font-size:15px;border:none;padding:13px 26px;border-radius:10px;cursor:pointer}
.uq-beta button.submit:disabled{opacity:.6;cursor:default}
.uq-beta .err{color:#fecaca;font-size:13px;font-weight:600}
.uq-beta .ok{padding:8px 2px}
.uq-beta .ok .h{font-size:18px;font-weight:800}
.uq-beta .ok .p{font-size:14px;opacity:.85;margin-top:6px;max-width:60ch}
.uq-beta footer{padding:0 40px 30px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12.5px}
.uq-beta footer a{color:var(--brand);text-decoration:none;font-weight:600}
@media (max-width:680px){
  .uq-beta .band,.uq-beta .body,.uq-beta footer{padding-left:24px;padding-right:24px}
  .uq-beta .band h1{font-size:26px}
  .uq-beta .benefits{grid-template-columns:1fr}
  .uq-beta .why ul{grid-template-columns:1fr}
  .uq-beta form.signup{grid-template-columns:1fr}
}
`;

export function BetaClient() {
  const [form, setForm] = useState({ company_name: "", contact_name: "", email: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please email hello@ultraquote.io.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Please email hello@ultraquote.io.");
      setStatus("idle");
    }
  }

  return (
    <div className="uq-beta">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="sheet">
        <div className="band">
          <div className="logo"><span className="mark">UQ</span> UltraQuote</div>
          <span className="pill">● You&apos;re invited — private beta</span>
          <h1>Send proposals your clients sign in minutes.</h1>
          <p>The all-in-one platform to build quotes, write polished proposals, and collect e-signatures — in one place.</p>
        </div>

        <div className="body">
          <p className="lead">
            Quoting today means juggling a spreadsheet, a Word template, and a separate signing tool — slow, error-prone,
            and easy to lose track of. <strong>UltraQuote replaces all three</strong> with a single branded workflow:
            build a multi-option quote, write the proposal (with an AI assistant), send it for a legally-binding
            signature, and watch it move from sent → viewed → signed in real time.
          </p>

          <div className="benefits">
            <div className="ben">
              <div className="ic">⚡</div>
              <h3>Quote in minutes</h3>
              <p>Build multi-option quotes from your catalog with tiers, discounts, tax &amp; margins — calculated instantly.</p>
            </div>
            <div className="ben">
              <div className="ic">✍️</div>
              <h3>Proposals that win</h3>
              <p>A branded document editor with AI writing help and live pricing tables — not just a flat PDF.</p>
            </div>
            <div className="ben">
              <div className="ic">🔏</div>
              <h3>Sign &amp; track</h3>
              <p>Built-in e-signature with client + counter-sign, and a dashboard showing pipeline and win rate.</p>
            </div>
          </div>

          <div className="why">
            <h2>★ Why join the beta now</h2>
            <ul>
              <li><span className="ck">✓</span><span><strong>Free during the beta</strong> — full access, no card required.</span></li>
              <li><span className="ck">✓</span><span><strong>Founding-member pricing</strong> — locked in when we launch.</span></li>
              <li><span className="ck">✓</span><span><strong>A direct line to the team</strong> — your feedback shapes the roadmap.</span></li>
              <li><span className="ck">✓</span><span><strong>White-glove setup</strong> — we&apos;ll help import your catalog &amp; branding.</span></li>
            </ul>
          </div>

          <div className="cta">
            {status === "done" ? (
              <div className="ok">
                <div className="h">You&apos;re on the list — thank you! 🎉</div>
                <div className="p">
                  We&apos;ll review your request and send your invite to <strong>{form.email}</strong> within 24 hours.
                  Questions? Email <a href="mailto:hello@ultraquote.io" style={{ color: "#7dd3fc" }}>hello@ultraquote.io</a>.
                </div>
              </div>
            ) : (
              <>
                <div className="t">Request your early-access invite</div>
                <div className="s">Tell us where to send it. Spots are limited while we onboard beta users one at a time — we&apos;ll reply within 24 hours.</div>
                <form className="signup" onSubmit={onSubmit} noValidate>
                  <div>
                    <label htmlFor="bs-company">Company name</label>
                    <input id="bs-company" type="text" autoComplete="organization" required value={form.company_name} onChange={set("company_name")} placeholder="Acme IT Services" />
                  </div>
                  <div>
                    <label htmlFor="bs-name">Your name</label>
                    <input id="bs-name" type="text" autoComplete="name" required value={form.contact_name} onChange={set("contact_name")} placeholder="Jordan Lee" />
                  </div>
                  <div className="full">
                    <label htmlFor="bs-email">Work email</label>
                    <input id="bs-email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} placeholder="jordan@acme.com" />
                  </div>
                  <div className="full">
                    <label htmlFor="bs-msg">Anything we should know? (optional)</label>
                    <textarea id="bs-msg" value={form.message} onChange={set("message")} placeholder="Team size, what you quote today, etc." />
                  </div>
                  <input className="hp" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} />
                  <div className="submit-row">
                    <button className="submit" type="submit" disabled={status === "submitting"}>
                      {status === "submitting" ? "Sending…" : "Request access →"}
                    </button>
                    {error && <span className="err">{error}</span>}
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        <footer>
          <div>© 2026 UltraQuote · Proposals &amp; quoting for modern teams</div>
          <div><a href="mailto:hello@ultraquote.io">hello@ultraquote.io</a></div>
        </footer>
      </div>
    </div>
  );
}
