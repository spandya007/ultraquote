# Rename assessment: UltraQuote → SmartProps (+ domain ultraquote.io → smartprops.io)

Status: **RESEARCH / assessment only — no code changed** (2026-07-17). Purpose: scope the full blast
radius of renaming the product and moving the domain, so the decision + sequencing can be made before
touching anything.

---

## 0. TL;DR

- **Two separable changes are bundled here:** (1) the **product NAME** (`UltraQuote` → `SmartProps`,
  string/branding), and (2) the **domain** (`ultraquote.io` → `smartprops.io`, URLs + email + OAuth
  redirects + auth allowlists). You can do them together or stage them.
- **Scale:** ~**149 occurrences across 57 code/config files** (347 across 99 files including docs +
  marketing). The vast majority are trivial string swaps. **The risk is concentrated in ~6 places**,
  listed in §4.
- **Good news — the rename is invisible to your customers' clients.** Generated proposals/PDFs carry
  **only the MSP's brand** (confirmed: zero `ultraquote` references in `lib/pdf/**` or `pdf-service/**`).
  End-signers never see the name. The rename touches only MSP-facing app chrome, marketing, legal,
  transactional email, and infra config.
- **The domain move is the higher-risk half**, not the string swap — because of OAuth redirect URIs,
  Supabase Auth redirect allowlists, and email deliverability (SPF/DKIM/DMARC on a new sending domain).
- **Recommended approach:** do it on a branch, drive as much as possible through env vars, keep
  `ultraquote.io` alive as a redirect during transition, and treat a handful of identifiers as
  *keep-as-is for backward-compat* rather than renaming (see §4).

---

## 1. Occurrence inventory (categorized)

### Category A — User-facing brand strings (must change; low risk)
These are the visible product name in the app chrome. Pure string swaps.

| File | What |
|---|---|
| `app/(auth)/login/page.tsx:16` | `<h1>UltraQuote Builder</h1>` — login screen |
| `app/layout.tsx:10` | `title: "UltraQuote Builder"` — browser tab / SEO title |
| `app/manifest.ts:5-6` | PWA `name` + `short_name` |
| `components/ui/sidebar.tsx:164-166` | `alt="UltraQuote"` + `"UltraQuote Builder for <tenant>"` |
| `components/settings/mfa-card.tsx` | 2FA card copy + **TOTP issuer** (see §4.1 — special) |
| `lib/help/content.ts` (×7) | In-app Help copy |
| `components/onboarding/onboarding-checklist.tsx`, `subscription-banner.tsx`, `subscription-card.tsx`, `account/suspended`, `accept-terms`, `templates-client`, `settings-client` | Assorted UI copy |
| `lib/admin/tenant-report.ts` | Tenant data-export report footer branding |

### Category B — Domain + email addresses (change **with** the domain; low risk, high count)
Hardcoded `hello@ultraquote.io`, `privacy@ultraquote.io`, `app.ultraquote.io`.

| File | Note |
|---|---|
| `app/api/beta-signup/route.ts`, `app/beta/beta-client.tsx`, `app/beta/page.tsx` | Beta funnel contact + canonical URL |
| `app/api/admin/test-email/route.ts:37`, `app/api/org/workspaces/invite/route.ts:8` | `BETA_NOTIFY_TO` / `PLATFORM_NOTIFY_EMAIL` **defaults** (overridable by env — prefer setting the env var) |
| `components/account/deletion-banner.tsx`, `lib/help/content.ts:426` | Support contact |
| `app/privacy-request/page.tsx:11` | `PRIVACY_EMAIL = "privacy@ultraquote.io"` |
| `lib/email/mailer.ts:5` | Comment only (SMTP sender is env-driven — see §3) |

### Category C — Legal documents (change carefully; **compliance-sensitive**)
Long-form HTML with the name embedded, **including the legal DBA** "Sameer Pandya doing business as
UltraQuote". Also hardcode `app.ultraquote.io`, `hello@`, `privacy@`.

- `app/privacy-policy/policy-html.ts`, `app/terms/terms-html.ts`, `app/cookie-policy/cookie-html.ts`
- `app/privacy-policy/page.tsx`, `app/terms/page.tsx`, `app/cookie-policy/page.tsx`, `app/account/accept-terms/page.tsx`

⚠️ These reference a **registered/assumed business name**. If "SmartProps" becomes the trading name you
may need to **file a new DBA/fictitious-business-name** and update the "doing business as" line, the
"Last updated" date, and re-trigger the accept-terms gate (migration 016) if terms materially change.
Treat this as a legal task, not just find-and-replace. See `docs/` legal notes + the legal-docs memory.

### Category D — Identifiers that are RISKY to rename (recommend KEEP or migrate-with-fallback)
These embed the name but are **not user-facing brand** — renaming them silently breaks stored state or
previously-exported files. **Recommendation: leave the literal strings as-is** (they're invisible), or
migrate with a backward-compat fallback.

| Identifier | File | If renamed… | Recommendation |
|---|---|---|---|
| **TOTP issuer** `"UltraQuote Builder"` | `mfa-card.tsx:51` | see §4.1 | Change label; existing 2FA keeps working |
| **Template file key** `ultraquote_template` + `.uqtemplate.json` ext | `templates-client.tsx:93,103,125,130` | already-exported template files **fail to import** | Keep the key; accept both if adding a new one (§4.2) |
| **localStorage keys** `ultraquote.accent` / `.lastActivity` / `.idleLogout` / `.onboardingDismissed` | `layout.tsx:16`, `accents.ts:16`, `idle-timeout.tsx:19-20`, `onboarding-checklist.tsx` | users lose accent theme + see onboarding again (self-healing, cosmetic) | Keep as-is, or rename with a one-time fallback read (§4.3) |
| **Supabase local project_id** `"ultraquote"` | `supabase/config.toml:5` | local dev stack name only | Cosmetic; optional |
| **E2E test emails** `@ultraquote.test` | `tests/e2e/config.ts`, `seed-e2e.sql` | none (test fixtures) | Cosmetic; optional |
| **package name** `"msp-quotebuilder"` | `package.json:2` | none (already not "ultraquote") | Optional |

### Category E — Marketing + repo + infra strings (change on your own schedule)
- `marketing-materials/**` (brochure, deck `build-deck.js` + `.pptx`, one-pager — HTML + regenerated
  PDFs), `marketing-site/index.html` + `marketing-site/netlify.toml`, `app/beta/**`.
- `public/` brand assets: `favicon-32.png`, `icon-192.png`, `icon-512.png`, `public/logos/` — the
  **wordmark/logo art needs redesign** (design work, not code).
- `CLAUDE.md`, `DEPLOY.md`, `README`, `docs/**` — internal; update opportunistically.
- **GitHub repo** `spandya007/ultraquote`, **Netlify site** `ultraquote.netlify.app` — optional renames.

---

## 2. The domain move (`ultraquote.io` → `smartprops.io`) — infra, not just code

The app currently lives at **app.ultraquote.io** (Netlify), sends from **hello@ultraquote.io** (Zoho
SMTP), with the marketing site on the apex. Moving domains means:

| System | Action | Risk |
|---|---|---|
| **Netlify** | Add `app.smartprops.io` as a custom domain (+ TLS); keep `app.ultraquote.io` as a redirect during transition | Low |
| **DNS / email auth** | Set up **SPF + DKIM + DMARC** for `smartprops.io` so `hello@smartprops.io` delivers (see the email-domain-setup memory for how ultraquote.io was done) | ⚠️ Med — new domain has zero sending reputation; warm up |
| **Zoho** | Add `smartprops.io`, create `hello@`/`privacy@` mailboxes, update the **SMTP sender** (`SMTP_USER`) — Zoho requires sender = authenticated mailbox | Med |
| **Supabase Auth** | Update **Site URL** + add `app.smartprops.io/auth/set-password`, `/auth/confirm` (+ localhost) to the **redirect allowlist BEFORE** cutover; keep old URLs during transition | ⚠️ **High** — get this wrong and invite/reset/confirm links break |
| **Supabase email templates** | Invite/reset/confirm templates are brand-worded "UltraQuote" — re-brand | Low |
| **QBO OAuth** | `QBO_REDIRECT_URI` env **and** the Intuit console redirect URI must match exactly (`app.smartprops.io/api/integrations/qbo/callback`). Sandbox now; prod needs prod keys + app review anyway (see integrations memory) | ⚠️ Med — mismatch = "redirect_uri invalid" |
| **DocuSeal** | Webhook URL is domain-based (`…/api/webhooks/docuseal`); update in the DocuSeal console + reply-to/sender branding | Med |
| **HubSpot (Phase B, if built)** | Redirect URI would target the new domain from day one — no migration | — |
| **Railway PDF service** | Env-driven URL, no brand dependency | None |
| **Anthropic / Gemini** | No brand/domain dependency | None |

**Env vars to review (not code):** `NEXT_PUBLIC_SITE_URL`, `SMTP_USER`/`SMTP_*`, `BETA_NOTIFY_TO`,
`PLATFORM_NOTIFY_EMAIL`, `QBO_REDIRECT_URI`, `DOCUSEAL_*`. Driving contacts/URLs through env means less
code churn — several Category-B defaults can be fixed by just setting the env var.

---

## 3. The 6 things that actually carry risk (read this section)

### 4.1 TOTP 2FA issuer (`mfa-card.tsx`)
The issuer `"UltraQuote Builder"` is baked into each user's authenticator entry **at enroll time**.
Changing the code to `"SmartProps"` affects **only new enrollments** — existing 2FA users keep working
(the secret is unchanged; the issuer is a display label). **Not a blocker, does not break logins.** The
only effect is cosmetic drift: old users' apps still show "UltraQuote Builder". Optionally prompt users
to re-enroll for a clean label; otherwise accept the drift. **Do not** force-reset factors.

### 4.2 Template export/import format (`templates-client.tsx`)
Exported files use key `ultraquote_template` and extension `.uqtemplate.json`; import validates
`if (!parsed?.ultraquote_template …)`. If you rename the key, **files a tenant already exported stop
importing.** Recommendation: **keep the `ultraquote_template` key** (invisible internal marker), or if
you want a branded key, accept **both** old and new on import. The `.uqtemplate.json` extension is
harmless to keep.

### 4.3 localStorage keys
`ultraquote.accent`, `ultraquote.lastActivity`, `ultraquote.idleLogout`,
`ultraquote.onboardingDismissed`. Renaming to `smartprops.*` makes returning users **lose their accent
theme** (resets to default) and **see the onboarding checklist again once** — cosmetic + self-healing.
Recommendation: **keep the keys**, or rename with a one-time fallback (`get(new) ?? get(old)`).

### 4.4 Supabase Auth redirect allowlist (domain move)
The single most likely thing to break the app during a domain cutover — invite/reset/confirm links
fall back to the Site URL if the redirect isn't allowlisted (a documented past gotcha). **Add the new
URLs before cutover; keep the old ones live during transition.**

### 4.5 QBO OAuth redirect URI (domain move)
Must match byte-for-byte between `QBO_REDIRECT_URI` and the Intuit console. Currently sandbox; the
prod go-live already requires new keys + Intuit review, so fold the domain into that step.

### 4.6 Legal DBA (Category C)
"Doing business as UltraQuote" is a legal identity string, not just branding. Renaming the trading name
may require a new DBA filing and a terms re-acceptance. Handle deliberately.

---

## 4. Sequencing recommendation

Because NAME and DOMAIN are separable, the lowest-risk path is:

1. **Prep (no cutover):** register `smartprops.io`; set up DNS + SPF/DKIM/DMARC + Zoho mailboxes; add
   `app.smartprops.io` to Netlify and the Supabase redirect allowlist **alongside** the old ones;
   design the new logo/wordmark + favicons.
2. **Branch `chore/rename-smartprops`:** swap Category A + B + C strings; update marketing (E); set the
   Category-D identifiers per §4 (mostly keep-as-is). Drive contacts/URLs via env where possible.
   Regenerate `public/` icons + marketing PDFs/deck.
3. **Legal:** update DBA line + "Last updated" date; decide if terms re-acceptance is needed.
4. **Cutover:** point env (`NEXT_PUBLIC_SITE_URL`, `SMTP_USER`, `QBO_REDIRECT_URI`, notify emails) to
   the new domain; update Intuit + DocuSeal consoles; verify invite/reset/confirm/QBO/signing flows on
   `app.smartprops.io`. Keep `ultraquote.io` redirecting for a long tail (old proposal links, bookmarks,
   email footers).
5. **After stable:** optionally rename the GitHub repo + Netlify site + local `config.toml`/e2e fixtures.

**Pre-commit gate (per CLAUDE.md):** `tsc --noEmit`, `npm run test`, `next build`, and — because this
touches auth/login chrome + routes — **Playwright E2E** (the login greeting/title is asserted in
`tests/e2e`; a title change will trip it, which is expected — update the assertion).

---

## 5. Effort estimate
- **String swaps (A/B/C/E):** mechanical, ~half a day of editing + regenerating assets/PDFs. Bounded by
  the legal review and logo redesign, not the code.
- **Domain/infra (§2):** ~half a day of console work + DNS propagation + email warm-up time (days, out
  of your hands). The Supabase allowlist + QBO redirect are the careful bits.
- **Risky identifiers (§4):** near-zero if you follow "keep as-is" — the safe default.
- **Not in scope / no work:** proposal/PDF output (already MSP-branded), Railway, Anthropic/Gemini,
  RLS/schema (no rename needed), stored tenant/quote data.

## 6. Changing the legal entity later (LLC / Inc.)

> Not legal/tax advice — confirm entity, IP-assignment, and tax specifics with a lawyer/CPA. This
> section maps what it touches in **this stack**.

Today the business is **Sameer Pandya, doing business as UltraQuote** (sole proprietor + DBA). "Changing
the entity" means forming a real company — **SmartProps LLC** or **SmartProps Inc.** (Delaware C-corp if
you'll ever raise) — and moving the business into it. This is distinct from the rename: the rename
changes the *name*; this changes the *legal person* that owns the IP and contracts with customers.

**Code footprint is small — but there's no single source of truth today.** The legal party ("Sameer
Pandya (doing business as UltraQuote)"), the mailing address (2005 Laurel Canyon Court, Fremont), and
the phone (510-250-1688) are **hardcoded across** `app/terms/terms-html.ts`,
`app/privacy-policy/policy-html.ts`, `app/cookie-policy/cookie-html.ts`, plus contact strings in
`app/privacy-request/page.tsx`, `lib/admin/tenant-report.ts`, and email footers. → **Mitigation: add a
`lib/legal/entity.ts` constant now** (name, DBA, address, contact email) and reference it everywhere, so
a future entity switch is a one-line edit instead of a scavenger hunt. (Wired into the checklist.)

**Terms are a contract with the named party.** Materially changing the party normally means users must
**re-accept** (the accept-terms gate, migration 016). A standard **assignment clause** in the Terms lets
the agreement transfer to a successor entity — worth having.

**Vendor/account surfaces, by entity-sensitivity:**

| Surface | Sensitivity | Changing entity later |
|---|---|---|
| **Stripe** (billing — designed, not built) | ⚠️ **Highest** — Stripe can't swap a legal entity on an existing account | New account under the entity → migrate customers/subscriptions, new keys + webhook secrets. **Create Stripe under the final entity from the start.** |
| **Intuit/QBO developer app** | App ownership + prod review tied to the developer company | Re-review under the new entity |
| **Domain registrant** (smartprops.io) | Registrant contact | Transfer registrant to the entity |
| **DocuSeal** | Sender identity on signed docs | New/updated account; historical signed PDFs keep the old identity (fine) |
| **Netlify / Supabase / Railway / Zoho / Anthropic / Google** | Billing owner | Move billing to the entity (mostly painless) |
| **Bank / merchant / tax** | Core | New EIN, business bank account, sales-tax registration if applicable |

**Cost of later vs. now.** Code cost is trivial either way. The real cost of "later" is the money +
customer layer: migrating a payment processor, re-papering/re-accepting contracts, splitting tax records
mid-year. **With zero signed-up clients and a rename already in flight, this is the cheapest moment to
decide the entity** — ideally form it **before launch and before wiring Stripe**, so the legal docs name
it from day one and nobody re-accepts anything. Doing it post-revenue is doable, just more paperwork.

## 7. Open decisions for you
1. Rename NAME and move DOMAIN together, or stage them?
2. Keep the risky internal identifiers as-is (recommended) or rebrand them with fallbacks?
3. Is "SmartProps" the legal trading name (→ DBA filing + terms update), or just a product/marketing name over the same legal entity?
4. **Form a real entity (LLC/Inc.) now vs. later?** (§6 — cheapest before launch + before Stripe.)
5. Rename the GitHub repo + Netlify site now, or leave them?
6. How long to keep `ultraquote.io` redirecting (I'd suggest ≥12 months for old proposal/email links)?
