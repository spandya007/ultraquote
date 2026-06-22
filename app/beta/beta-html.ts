// Public beta-signup landing page markup for /beta. Rendered via
// dangerouslySetInnerHTML in page.tsx (same pattern as the legal pages).
// All CSS is scoped under `.uq-beta` so it can't leak into the app, and the
// page is always light/branded regardless of theme. Palette: "Signal"
// (Blue #2563EB primary + Teal #0EA5A4 accent) — see marketing-materials/BRAND-PALETTE.md.

export const BETA_HTML = `
<style>
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
.uq-beta .why li::before{content:"\\2713";color:var(--ok);font-weight:900;font-size:13px;margin-top:1px}
.uq-beta .cta{display:flex;align-items:center;justify-content:space-between;gap:22px;background:var(--ink);border-radius:14px;padding:24px 28px;color:#fff;flex-wrap:wrap}
.uq-beta .cta .t{font-size:18px;font-weight:800;letter-spacing:-.01em}
.uq-beta .cta .s{font-size:13px;opacity:.8;margin-top:4px;max-width:46ch}
.uq-beta .cta a{background:#fff;color:var(--brand);font-weight:800;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:10px;white-space:nowrap}
.uq-beta footer{padding:22px 40px 30px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12.5px}
.uq-beta footer a{color:var(--brand);text-decoration:none;font-weight:600}
@media (max-width:680px){
  .uq-beta .band,.uq-beta .body,.uq-beta footer{padding-left:24px;padding-right:24px}
  .uq-beta .band h1{font-size:26px}
  .uq-beta .benefits{grid-template-columns:1fr}
  .uq-beta .why ul{grid-template-columns:1fr}
  .uq-beta .cta a{width:100%;text-align:center}
}
</style>
<div class="uq-beta">
  <div class="sheet">
    <div class="band">
      <div class="logo"><span class="mark">UQ</span> UltraQuote</div>
      <span class="pill">&#9679; You're invited &mdash; private beta</span>
      <h1>Send proposals your clients sign in minutes.</h1>
      <p>The all-in-one platform to build quotes, write polished proposals, and collect e-signatures &mdash; in one place.</p>
    </div>

    <div class="body">
      <p class="lead">Quoting today means juggling a spreadsheet, a Word template, and a separate signing tool &mdash; slow, error-prone, and easy to lose track of. <strong>UltraQuote replaces all three</strong> with a single branded workflow: build a multi-option quote, write the proposal (with an AI assistant), send it for a legally-binding signature, and watch it move from sent &rarr; viewed &rarr; signed in real time.</p>

      <div class="benefits">
        <div class="ben">
          <div class="ic">&#9889;</div>
          <h3>Quote in minutes</h3>
          <p>Build multi-option quotes from your catalog with tiers, discounts, tax &amp; margins &mdash; calculated instantly.</p>
        </div>
        <div class="ben">
          <div class="ic">&#9997;&#65039;</div>
          <h3>Proposals that win</h3>
          <p>A branded document editor with AI writing help and live pricing tables &mdash; not just a flat PDF.</p>
        </div>
        <div class="ben">
          <div class="ic">&#128274;</div>
          <h3>Sign &amp; track</h3>
          <p>Built-in e-signature with client + counter-sign, and a dashboard showing pipeline and win rate.</p>
        </div>
      </div>

      <div class="why">
        <h2>&#9733; Why join the beta now</h2>
        <ul>
          <li><span><strong>Free during the beta</strong> &mdash; full access, no card required.</span></li>
          <li><span><strong>Founding-member pricing</strong> &mdash; locked in when we launch.</span></li>
          <li><span><strong>A direct line to the team</strong> &mdash; your feedback shapes the roadmap.</span></li>
          <li><span><strong>White-glove setup</strong> &mdash; we'll help import your catalog &amp; branding.</span></li>
        </ul>
      </div>

      <div class="cta">
        <div>
          <div class="t">Want in? We'll send your invite within 24 hours.</div>
          <div class="s">Spots are limited while we onboard beta users one at a time.</div>
        </div>
        <a href="mailto:hello@ultraquote.io?subject=UltraQuote%20beta%20%E2%80%94%20request%20access&amp;body=Hi%20UltraQuote%20team%2C%20I'd%20like%20early%20access%20to%20the%20beta.">Request access &rarr;</a>
      </div>
    </div>

    <footer>
      <div>&copy; 2026 UltraQuote &middot; Proposals &amp; quoting for modern teams</div>
      <div><a href="mailto:hello@ultraquote.io">hello@ultraquote.io</a></div>
    </footer>
  </div>
</div>
`;
