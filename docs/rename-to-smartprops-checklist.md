# Execution checklist: UltraQuote → SmartProps + smartprops.io

Companion to `docs/rename-to-smartprops-assessment.md` (read that for the *why*; this is the *how*).

**Key simplifying constraint (2026-07-17): NO clients have signed up yet.** Downtime is acceptable, so
this is a **clean combined cutover** — name + domain together, in one maintenance window. All the
backward-compat concerns from the assessment (§4) **do not apply**: no existing 2FA to preserve, no
exported template files in the wild, no localStorage prefs to migrate, no terms re-acceptance for
existing users, no long-tail of old proposal links. So we just **change things directly**.

Legend: **[you]** = console/DNS/manual · **[code]** = repo edit · **[verify]** = check it works.

---

## Migration model — "how do we actually move from ultraquote to smartprops?"

**Short answer: nothing moves. There is no data migration.** The app, its database (Supabase), its
files (Supabase Storage), and its Netlify site all stay exactly where they are. "Migrating" here means
two independent things layered on the same running system:

1. **A new front door (domain).** Netlify serves the same site under many hostnames at once, and Supabase
   Auth / QBO / DocuSeal accept a *list* of allowed URLs. So you **add** `app.smartprops.io` (and the new
   allowlist entries) *alongside* the ultraquote ones. For a while, **both URLs load the identical app**.
2. **A new coat of paint (rebrand).** The name strings, logos, favicons, and email `from:` address change
   from UltraQuote → SmartProps. This is the Phase 3/4 code branch + the `ENTITY` constant flip.

They're decoupled, so the safe sequence is **add → verify → cut over → retire**:

| Stage | app.ultraquote.io | app.smartprops.io | Branding | Email from |
|---|---|---|---|---|
| **A. Add** (now) | primary, live | live (same app) | UltraQuote | hello@ultraquote.io |
| **B. Rebrand** (branch merged) | primary, live | live | **SmartProps** | still ultraquote |
| **C. Cut over** (env flip) | redirects → smartprops | **primary** | SmartProps | **hello@smartprops.io** |
| **D. Retire** (later) | removed | primary | SmartProps | smartprops |

Because there are **no signed-up users**, you *could* skip the coexistence and do a hard cutover in one
window — but coexistence costs nothing and lets you click through `app.smartprops.io` before committing.
The one thing that must be additive-then-switched carefully is **email** (see the Zoho/DNS warning in
Phase 1b): the SMTP `from:` address only changes when you flip `SMTP_USER` (Phase 5), and the new domain
needs SPF/DKIM/DMARC passing first.

---

## Phase 0 — Decisions to lock before starting
- [ ] Is **SmartProps** the legal **trading name** (→ file a new DBA + update legal docs' "doing
      business as" line), or just a **product/marketing name** over the same legal entity (Sameer
      Pandya)? → determines whether Phase 4 (legal) is a filing or a copy edit.
- [ ] Confirm final assets exist: **SmartProps logo/wordmark** + favicons (design work, needed in Phase 3).
- [ ] Confirm email addresses: `hello@smartprops.io`, `privacy@smartprops.io` (used across code + legal).
- [ ] Decide whether to also rename the **GitHub repo** and **Netlify site** (optional; Phase 6).

---

## Phase 1 — Domain + email infrastructure (do FIRST; DNS/email take time to propagate)
- [x] **[you]** ✅ **DONE (2026-07-20)** — `smartprops.io` registered.
- [x] **[you]** ✅ **DONE (2026-07-20)** — Zoho mailboxes created: **`hello@smartprops.io`** +
      **`sales@smartprops.io`**; SMTP **app password** generated (set as `SMTP_PASS` in Phase 5).
- [x] **[you]** ✅ **DONE (2026-07-20)** — DNS **SPF + DKIM + DMARC** set + green in Zoho's console.
- [ ] **[decide at rename]** The **`privacy@`** address (only `hello@`/`sales@` exist today). At the Phase 3
      rename either add `privacy@smartprops.io` in Zoho, or set `ENTITY.privacyEmail = "hello@smartprops.io"`.
      Not a blocker for the deploy — legal docs reference it, resolved in the rename branch.

### Phase 1b — Netlify custom domain (detailed) — the app: `app.smartprops.io`
> Mental model — **there is no data migration.** It's the same Netlify site + same Supabase database.
> You're just adding a second front door (a new hostname) and later making it the primary one. A Netlify
> site can serve **multiple custom domains at once**, so `app.ultraquote.io` and `app.smartprops.io` can
> both point at the SAME site simultaneously — zero downtime, nothing to move. See "Migration model" below.

- [ ] **[you] Netlify → the existing app site** (currently `ultraquote.netlify.app` / `app.ultraquote.io`)
      → **Site configuration → Domain management → Add a domain** → enter `app.smartprops.io` → Netlify
      says "add this DNS record."
- [ ] **[you] DNS (do it where `smartprops.io`'s records already live — i.e. wherever the Zoho MX records
      are).** Add a **CNAME**: host `app` → value ` <your-site>.netlify.app` (e.g. `ultraquote.netlify.app`).
      TTL default. That's the only record needed for the app subdomain.
      - ⚠️ **DO NOT move `smartprops.io`'s nameservers to Netlify DNS** unless you first re-create the
        **Zoho MX + SPF + DKIM** records there — switching nameservers without them **breaks your new
        email**. Keeping DNS at your current host and adding one CNAME is the safe path.
- [x] **[you]** ✅ **DONE (2026-07-20)** — Netlify TLS cert for `app.smartprops.io` provisioned (green).
- [x] **[verify]** ✅ **DONE** — `https://app.smartprops.io` serves the app (still UltraQuote-branded until
      the Phase 3 rename); login works; both domains live.
- [x] **[you]** ✅ **DONE** — `app.ultraquote.io` kept as PRIMARY for now; flip to `app.smartprops.io` at
      cutover (Phase 6).
- [ ] **[you] (optional) Apex marketing site** — if you keep `marketing-site/`, add `smartprops.io`
      (+ `www`) to that **separate** Netlify site the same way (apex needs an `ALIAS`/`ANAME`, or an
      `A` record to Netlify's load balancer `75.2.60.5`, per Netlify's instructions for that site).

- [x] **[verify]** ✅ **DONE** — test email from `hello@smartprops.io` reaches an external inbox (watch
      spam/reputation over the first few days).

## Phase 2 — External service consoles (point them at the new domain) ✅ DONE (2026-07-20)
> These use the **new** callback/redirect URLs. Since there are no users, you can switch cleanly.
>
> ⚠️ **Two separate email paths — don't confuse them.** (1) **App-sent** email (beta/test/notification
> + self-serve signup confirm) goes through `lib/email/mailer.ts` → Netlify `SMTP_*` env (Phase 5).
> (2) **Supabase Auth** email (invite / password-reset / confirm) goes through **Supabase's OWN Custom
> SMTP config** in the dashboard — NOT the app env vars, NOT the code. The invite's "From" name+address
> is set there, so a code rebrand (Phase 3) will NOT change it.
- [x] **[you] Supabase Auth → URL Configuration:** ✅ Site URL + redirect allowlist updated for
      `app.smartprops.io` (`/auth/set-password`, `/auth/confirm`, `/**`, + localhost).
- [x] **[you] Supabase → Auth email templates** (invite / reset / confirm): ✅ re-branded to SmartProps
      / links fixed. (This is the email **body** only — the sender line is the SMTP setting below.)
- [x] **[you] Supabase → Authentication → Emails → SMTP Settings (Custom SMTP)** — ✅ **DONE (2026-07-20)**
      — sender switched to `hello@smartprops.io` (Sender email + Username → smartprops mailbox app
      password); **verified**: a fresh invite arrived from the smartprops sender. ⚠️ Zoho requires
      From == the authenticated mailbox. *(This was the "invite still shows
      UltraQuote &lt;hello@ultraquote.io&gt;" bug — the sender settings were still the old values while
      everything else had switched.)*
- [x] **[you] Intuit / QBO developer console:** ✅ redirect URI
      `https://app.smartprops.io/api/integrations/qbo/callback` added under **Keys & credentials → Redirect
      URIs** (must equal `QBO_REDIRECT_URI` exactly).
- [x] **[you] DocuSeal console:** ✅ webhook endpoint updated to
      `https://app.smartprops.io/api/webhooks/docuseal?secret=…` + sender/reply-to branding, **Saved**.

## Phase 3 — Code + assets (branch `chore/rename-smartprops`)
> Since there are no users, rename freely — no fallbacks needed.

### 3a. Brand strings (Category A)
- [ ] **[code]** `app/(auth)/login/page.tsx` — `UltraQuote Builder` → `SmartProps`.
- [ ] **[code]** `app/layout.tsx` — `title`; `app/manifest.ts` — `name` + `short_name`.
- [ ] **[code]** `components/ui/sidebar.tsx` — `alt` text + "…Builder for <tenant>" line.
- [ ] **[code]** `components/settings/mfa-card.tsx` — copy **and the TOTP `issuer`** (safe to change
      outright — no existing enrollments). Suggest issuer `"SmartProps"`; drop the "(Dev)" logic or keep.
- [ ] **[code]** `lib/help/content.ts` (×7), `lib/admin/tenant-report.ts` (footer),
      `components/onboarding/onboarding-checklist.tsx`, `subscription-banner.tsx`, `subscription-card.tsx`,
      `account/suspended`, `accept-terms`, `templates-client.tsx`, `settings-client.tsx`.

### 3b. Domain + email in code (Category B)
- [ ] **[code]** Replace hardcoded `hello@ultraquote.io` / `privacy@ultraquote.io` / `app.ultraquote.io`
      in: `app/api/beta-signup/route.ts`, `app/beta/beta-client.tsx`, `app/beta/page.tsx`,
      `components/account/deletion-banner.tsx`, `app/privacy-request/page.tsx:11`,
      `lib/email/mailer.ts` (comment), `lib/help/content.ts:426`.
- [ ] **[code]** For the **env-defaulted** ones (`app/api/admin/test-email/route.ts`,
      `app/api/org/workspaces/invite/route.ts`) — prefer setting the env var (Phase 5); update the
      fallback string too for hygiene.

### 3c. Internal identifiers (now safe to rename — no users)
- [ ] **[code]** localStorage keys — `layout.tsx:16`, `lib/theme/accents.ts:16`,
      `components/auth/idle-timeout.tsx:19-20`, `components/onboarding/onboarding-checklist.tsx`:
      `ultraquote.*` → `smartprops.*` (or leave — cosmetic; your call).
- [ ] **[code]** Template file format — `components/templates/templates-client.tsx`: optional rename of
      `ultraquote_template` key / `.uqtemplate.json` ext to `smartprops_*` (no wild files to break).
- [ ] **[code]** `supabase/config.toml` `project_id`; `tests/e2e/config.ts` + `tests/e2e/seed-e2e.sql`
      `@ultraquote.test` fixtures; `package.json` `name` (optional).

### 3d. Assets + green rebrand (Category E)
> **Timing (answer to "when's a good time for the green logos?"):** design them **now, in parallel** —
> logo/favicon art has no code dependency and needn't wait. But **swap them IN during this branch**,
> together with the name strings + brand color, so the app flips to "SmartProps green" in one coherent
> change (avoid a half-blue/half-green interim state). Deliverables to hand off to design: a square app
> icon (for `192/512` PWA + `favicon-32`) and a horizontal wordmark (sidebar/login), on transparent bg,
> in the new green.
- [ ] **[you/code]** Replace `public/favicon-32.png`, `public/icon-192.png`, `public/icon-512.png` with
      SmartProps art; update the `public/logos/` wordmark. (Vendor assets like `connect-to-quickbooks.svg`
      stay as-is — those are QuickBooks' brand, not ours.)
- [ ] **[code]** **Brand color → green.** Today the primary is "Signal" blue `#2563EB` (+ teal accent).
      Going green means updating `--primary`/`--ring` in `app/globals.css` (light + dark blocks) and the
      default accent in `lib/theme/accents.ts` (there's already a **`forest`** green swatch to start from;
      pick the final green + set it as the brand default). Ship this in the same branch as the logos so
      chrome + logo + accent match. Proposal/PDF output is unaffected (MSP-branded, not app-branded).
- [ ] **[code]** Marketing: `marketing-site/index.html` + `netlify.toml`, `app/beta/**`,
      `marketing-materials/**` (brochure, one-pager, `build-deck.js` → regenerate `.pptx` + PDFs) — update
      name **and** the palette to green (see the brand-palette memory / `marketing-materials/`).
- [ ] **[code]** Docs hygiene: `CLAUDE.md`, `DEPLOY.md`, `README`, `docs/**` (opportunistic).

## Phase 4 — Legal + entity centralization (do deliberately)

### 4a. Centralize the legal-entity identity (do this NOW — makes a future entity switch one edit)
> Rationale in assessment §6. Today the party/address/contact are hardcoded across the 3 legal HTML
> files + several contact strings, so a future LLC/Inc. switch would be a scavenger hunt. Fix it once.
- [x] **[code]** ✅ **DONE (2026-07-17, ahead of the rename)** — `lib/legal/entity.ts` created with a
      single typed `ENTITY` constant (legalName / dba / productName / addressLines / phone / contactEmail /
      privacyEmail / appUrl / appDomain) + a `legalParty()` helper. Seeded with **current** values
      (behavior-preserving) — the rename flips these to SmartProps / smartprops.io in one place; forming
      an entity later becomes `legalName: "SmartProps LLC"` + `dba: null`, one edit.
- [x] **[code]** ✅ **DONE** — wired the **code-rendered** contact surfaces to `ENTITY`:
      `app/privacy-request/page.tsx` (email + metadata), `components/account/deletion-banner.tsx`,
      `lib/admin/tenant-report.ts` (title/heading/body/footer), and the notification-email fallbacks in
      `app/api/beta-signup/route.ts` (+ its inline strings), `app/api/admin/test-email/route.ts`,
      `app/api/org/workspaces/invite/route.ts`. tsc + 104 unit tests green (incl. the 9 tenant-report
      render tests → output byte-identical).
- [ ] **[code]** DEFERRED BY DESIGN — the Termly `*-html.ts` blobs (`app/terms/**`, `app/privacy-policy/**`,
      `app/cookie-policy/**`) are **not** interpolated from `ENTITY` (they're regenerated as a unit in
      Termly). Update them during the rename via Termly regen, using `ENTITY` as the canonical values
      (documented in `entity.ts`). Same for prose copy in `lib/help/content.ts` (rename Category A).

### 4b. Legal content updates
- [ ] **[you]** ⚠️ STILL OPEN — if SmartProps is the current trading name → **file the DBA/fictitious-business-name** with the county/state. (The docs now SAY "doing business as SmartProps"; the filing is the real-world step.)
- [x] **[code]** ✅ **DONE (2026-07-21, commit `05c6531`)** — Terms/Privacy/Cookie HTML + page metadata:
      product name → SmartProps, "doing business as SmartProps", all `app.ultraquote.io` → `app.smartprops.io`,
      `hello@`/`privacy@ultraquote.io` → `smartprops.io`, "Last updated" → July 21, 2026. Legal party stays
      Sameer Pandya (sole proprietor). Build green.
- [x] **[code]** ✅ No re-acceptance needed (no signed-up users). ⚠️ **At cutover:** confirm the "Last
      updated" date matches the actual go-live day (currently set to 2026-07-21), and that the accept-terms
      gate passes for the first real signup.
- [ ] **[note]** **Future entity change** (LLC/Inc., assessment §6): once §4a lands, the code side is a
      one-line edit + terms re-acceptance. The real work is external — new Stripe account under the
      entity (do Stripe under the final entity from the start), Intuit/QBO app re-review, domain
      registrant transfer, bank/EIN/tax, IP assignment. Cheapest to form the entity **before launch and
      before wiring Stripe**.

## Phase 5 — Env vars (Netlify, All Scopes — see the env-var-scopes gotcha)
- [x] **[you]** ✅ `NEXT_PUBLIC_SITE_URL` = `https://app.smartprops.io`
- [x] **[you]** ✅ `SMTP_USER` = `hello@smartprops.io` (+ `SMTP_PASS` = the new Zoho app password)
- [x] **[you]** ✅ **DONE (2026-07-20)** — `BETA_NOTIFY_TO` + `PLATFORM_NOTIFY_EMAIL` set to smartprops
      inboxes. These are the *recipient* inboxes for internal notification emails (NOT the sender):
      `BETA_NOTIFY_TO` receives new **/beta signup** alerts + the /admin "test email";
      `PLATFORM_NOTIFY_EMAIL` receives a note when an **Org Admin creates a new workspace**.
- [x] **[you]** ✅ `QBO_REDIRECT_URI` = `https://app.smartprops.io/api/integrations/qbo/callback`
- [x] **[you]** ✅ `DOCUSEAL_*` re-checked.
- [ ] **[you]** Trigger a fresh Netlify deploy (env changes need a rebuild to take effect).

## Phase 6 — Pre-merge gate + cutover
- [ ] **[verify]** Local: `npx tsc --noEmit` · `npm run test` · `npx next build`.
- [ ] **[verify]** `npm run test:e2e` — **expect the login title/greeting assertion to change**; update
      `tests/e2e` for "SmartProps". (This is the exact class of change CLAUDE.md flags for E2E.)
- [ ] **[you]** Merge to `main` → Netlify auto-deploys to `app.smartprops.io`.
- [ ] **[you]** (Optional) rename GitHub repo `spandya007/ultraquote` and the Netlify site slug.

## Phase 7 — Post-cutover verification on app.smartprops.io
- [ ] **[verify]** Login screen + tab title + sidebar all say **SmartProps**.
- [ ] **[verify]** **Signup → email confirm** flow: the confirm email comes from `hello@smartprops.io`
      and the link lands on `app.smartprops.io/auth/confirm` (the redirect-allowlist test).
- [ ] **[verify]** **Invite** a member + **password reset** → links resolve on the new domain.
- [ ] **[verify]** **2FA enroll** → authenticator shows "SmartProps".
- [ ] **[verify]** **QBO connect** (sandbox) → OAuth round-trips through the new callback with no
      "redirect_uri invalid".
- [ ] **[verify]** **Send a quote for signature** (DocuSeal sandbox) → webhook hits the new URL, status
      flips, and on signed the QBO invoice fires.
- [ ] **[verify]** Legal pages (`/privacy-policy`, `/terms`, `/cookie-policy`, `/privacy-request`) show
      the new name/DBA/date/emails.
- [ ] **[you]** Decide on `ultraquote.io`: with no clients you can let it lapse, or keep a simple
      redirect to `smartprops.io` for any old marketing/beta links (low urgency).

---

## Suggested commit slices on the branch
1. Brand strings (3a) + assets (3d icons).
2. `lib/legal/entity.ts` centralization (4a) + legal content (4b) + domain/email in code (3b).
3. Internal identifiers (3c).
4. Marketing regen (3d).
5. E2E assertion updates (Phase 6).

Env + console work (Phases 1, 2, 5) is **manual/out-of-repo** — do it around the merge, not in commits.
