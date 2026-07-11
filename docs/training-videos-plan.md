# UltraQuote — Training Video Plan

> Working doc. Goal: define the set of training/onboarding videos to produce for UltraQuote,
> who each is for, and roughly how long. Nothing here is final — we're using this to discuss and prioritize.

## Audiences
1. **New tenant Owner** — the MSP owner who just got invited, needs to set up the company and send a first quote.
2. **Team Member** — a salesperson at an MSP tenant; creates/sends quotes but can't touch products/settings.
3. **Platform Admin** — us / whoever runs UltraQuote; onboards tenants, manages subscriptions.
4. **Prospect / marketing** — short sizzle content for the website and sales calls (not "training" per se, but worth flagging).

## Decisions (locked 2026-07-10)
- **Format: Option A — short task videos (2–4 min each).** One job per video; easy to keep current and to deep-link from in-app Help.
- **Hosting: Loom.** Publish to a shared Loom Space; embed/deep-link into `/help`.
- **Sample data: clean demo tenant** (recommended, not the real CMIT tenant) so nothing real is on screen. Suggested seed below.
- **Narration: natural (human) voice — founder narrating over screen capture.** No AI/synthetic voice. Rationale: Loom's one-take screen+mic workflow, authenticity for early-stage B2B, ad-lib flexibility. (Revisit AI voice only if we localize or content freezes.)
- **Detailed per-video scripts:** see [`docs/training-video-scripts.md`](./training-video-scripts.md) (videos 2–11).

### Suggested demo tenant seed (record everything against this)
- Tenant: **"Northwind IT"** (fake MSP), logo = a simple placeholder mark.
- 2 users: an **Owner** (`owner@northwind.example`) and a **Member** (`sales@northwind.example`).
- ~8 catalog products across a few categories, at least one **multi-tier** product and one with a **setup fee**.
- 2 clients (one with a logo + secondary contact + full structured address).
- 1 quote pre-built to the "Document" stage for the Preview/Send videos (so we don't rebuild it on camera).

### Loom conventions (apply to every video)
- Record at **1080p**, keep each **≤ 4 min**; trim dead air.
- Add **chapters** matching the beats below; add a **title + one-line description**.
- End with a **CTA/link** to the next video or the matching `/help#topic`.
- **Blur/avoid** anything sensitive (real client names, real email, API keys, the browser's other tabs/bookmarks).
- Consistent intro: 3-sec title card "UltraQuote · <topic>".

---

## Proposed video library (Owner + Member)

### Tier 1 — Must-have for launch (getting a quote out the door)
| # | Title | Audience | ~Len | Covers |
|---|-------|----------|------|--------|
| 1 | Quick Start: from login to your first sent quote | Owner | 6–8 min | The 5-min happy path; sets context for everything else |
| 2 | Setting up your company | Owner | 3 min | Logo, company details, **tax rate**, quote defaults (prefix, valid days, payment terms) |
| 3 | Building your product catalog | Owner | 4 min | Add products, pricing tiers, setup fees; **CSV import** + template |
| 4 | Adding clients | Owner/Member | 2 min | Add/edit, logo, **secondary contact/2nd signer, structured address**, CSV import |
| 5 | Creating a quote | Owner/Member | 4 min | New Quote, scenarios, add from catalog, free-text lines, qty/discounts |
| 6 | Scenarios & the "Recommended" option | Owner/Member | 3 min | Good/better/best, star a scenario, per-scenario totals |
| 7 | Discounts, setup fees & tax | Owner/Member | 3 min | Per-line %/$ discount, "You save", one-time setup, company tax rate |
| 8 | Writing the proposal (Document tab) | Owner/Member | 4 min | BlockNote basics, insert fields ({{client.*}}), logos, page breaks |
| 9 | Adding pricing tables to the document | Owner/Member | 2 min | Inline pricing block, recommended/all/specific |
| 10 | Preview & PDF | Owner/Member | 2 min | Preview modal, header/footer toggle, download PDF |
| 11 | Sending for signature (DocuSeal) | Owner/Member | 4 min | Signers, signature/initials/checkbox fields, send flow, status lifecycle |

### Tier 2 — Depth & power features
| # | Title | Audience | ~Len | Covers |
|---|-------|----------|------|--------|
| 12 | Templates | Owner/Member | 3 min | Save-as-template, start a quote from a template, export/import |
| 13 | AI writing assistant | Owner/Member | 3 min | Improve/expand/shorten/tone, generate, continue, preview-before-apply |
| 14 | Import a proposal from Word/Markdown | Owner/Member | 2 min | .docx/.md import into the Document |
| 15 | Extract pricing from a document | Owner | 3 min | Doc tables → scenarios, link/create/free-text review |
| 16 | Duplicating & reusing quotes | Owner/Member | 2 min | Duplicate action, refresh prices from catalog |
| 17 | Team, roles & permissions | Owner | 3 min | Invite members, owner vs member, quote ownership, read-only |
| 18 | Security: password & 2FA | All | 3 min | Change password, enroll TOTP, recovery codes |
| 19 | Dashboard & pipeline | Owner | 2 min | Open pipeline, MRR, win rate, expiring soon |
| 20 | Appearance | All | 1 min | Dark mode, accent themes |

### Tier 3 — Platform Admin (internal)
| # | Title | Audience | ~Len | Covers |
|---|-------|----------|------|--------|
| 21 | Onboarding a new tenant | Platform Admin | 4 min | /admin invite-first flow, set-password landing |
| 22 | Subscriptions & access lifecycle | Platform Admin | 4 min | Terms, expiry/grace, kill switches, company-field locking |
| 23 | AI cost monitoring | Platform Admin | 2 min | "AI cost per signed doc" card, the 25-call/quote cap |

---

---

## Tier 1 — detailed shot lists

> Each video: **Goal** (what the viewer can do after) · **Prereqs** (demo state) · **Beats** (on-screen click path / chapters) · **Say** (talking points) · **Avoid** (gotchas / don't-show) · **Help link**.

### 1 · Quick Start: login → first sent quote  ·  ~6–8 min · Owner
- **Goal:** See the whole happy path end-to-end so the rest of the library has context.
- **Prereqs:** Demo tenant with catalog + 1 client already set up (don't set those up here — that's videos 2–4).
- **Beats:** (1) Log in → dashboard tour in 20s. (2) New Quote → name it. (3) Add 2–3 catalog lines. (4) Document tab: a sentence + a pricing table. (5) Preview. (6) Send for signature. (7) Show the status badge flip to "sent".
- **Say:** "This is the 5-minute path; each step has its own short video if you want depth." Frame scenarios/discounts/AI as optional power features.
- **Avoid:** Don't linger — this is a trailer, not a manual. No settings/admin.
- **Help link:** `/help#getting-started`

### 2 · Setting up your company  ·  ~3 min · Owner
- **Goal:** Configure company identity + defaults that flow into every quote/PDF.
- **Prereqs:** Fresh-ish tenant; have a logo file ready.
- **Beats:** Settings → **Company Settings**: upload logo; fill contact/phone/address; set **Tax Rate**. Then **Quote Defaults**: prefix, valid days, payment terms. Show a Preview so they see the logo + tax on a proposal.
- **Say:** Tax rate is **company-wide** and read-only on the quote (set here). Logo appears on the proposal first page, not the running header.
- **Avoid:** **Company Name + Contact Email are locked** ("Managed by UltraQuote") for tenant users — call this out so they don't hunt for it. Don't show the Appearance card (that's video 20).
- **Help link:** `/help#getting-started`

### 3 · Building your product catalog  ·  ~4 min · Owner
- **Goal:** Add products with tiers + setup fees, and bulk-import via CSV.
- **Prereqs:** Have the sample CSV (`public/product-import-template.csv`) handy.
- **Beats:** (1) /products → Add product: name, category, description. (2) Add **pricing tiers** (show multi-tier + live margin). (3) Details → **Setup Price**. (4) **Import CSV**: open the "CSV format" popover, download the sample template, upload, show grouped result.
- **Say:** Only **Item Name** is required on import; headers are alias-matched. Tier pricing supersedes a single product price. Setup fee is a one-time charge.
- **Avoid:** Don't expose hidden/legacy columns (Zomentum/integration IDs).
- **Help link:** `/help#products`

### 4 · Adding clients  ·  ~2 min · Owner/Member
- **Goal:** Add a client with logo, a secondary signer, and a structured address.
- **Prereqs:** Client logo file ready.
- **Beats:** /clients → Add Client drawer: company + primary contact; upload **logo**; **secondary contact (2nd signer)**; the 6 **structured address** fields. Mention CSV import for bulk.
- **Say:** Secondary contact is primarily for a **second signature**. Structured address composes onto the proposal; free-text address still works as fallback.
- **Avoid:** Duplicate-validation-on-blur is nice to show briefly but don't dwell.
- **Help link:** `/help#getting-started`

### 5 · Creating a quote  ·  ~4 min · Owner/Member
- **Goal:** Create a quote and populate line items from the catalog + free text.
- **Prereqs:** Catalog + 1 client exist.
- **Beats:** (1) /quotes → **New Quote** (Start from: Blank). (2) Editable title; note auto-save + read-only status badge. (3) **Add from catalog** spotlight → pick a multi-tier product → choose a tier. (4) **Add free-text item**. (5) Edit qty / unit price. (6) Right panel: client card, valid-until, payment terms.
- **Say:** Everything **auto-saves** (no Save button). Line items **snapshot** catalog price at add-time. Quote number is auto-assigned.
- **Avoid:** Save discounts/setup/scenarios for videos 6–7. Don't touch status (system-managed).
- **Help link:** `/help#quotes`

### 6 · Scenarios & the "Recommended" option  ·  ~3 min · Owner/Member
- **Goal:** Build good/better/best options in one quote.
- **Prereqs:** A quote with a few line items.
- **Beats:** Add a 2nd/3rd **scenario tab**; rename; add different line items per scenario; **star one as Recommended**; show per-scenario **Monthly / One-time totals** in the right panel.
- **Say:** Scenarios are how you present tiered pricing; the Recommended one is highlighted for the client. Refresh-prices-from-catalog applies across all scenarios.
- **Avoid:** Don't confuse scenarios (options within one quote) with templates.
- **Help link:** `/help#quotes`

### 7 · Discounts, setup fees & tax  ·  ~3 min · Owner/Member
- **Goal:** Apply per-line discounts, understand setup fees and tax on totals.
- **Prereqs:** A quote with catalog lines (one with a setup fee).
- **Beats:** (1) **Disc** column: apply a **%** discount, then switch a line to **$** (show they're mutually exclusive). (2) Show the client-facing green **"You save $X"** row in Preview. (3) Point out a **setup fee** folding into the one-time total (not discounted). (4) Show tax applied; note the rate is read-only (from Company Settings).
- **Say:** All totals/tax/margins compute on the **discounted** price. Setup fees are one-time and excluded from discounts.
- **Avoid:** Margins column is internal — toggle it off before showing anything client-facing.
- **Help link:** `/help#quotes`

### 8 · Writing the proposal (Document tab)  ·  ~4 min · Owner/Member
- **Goal:** Author the proposal narrative with variables, images, and layout.
- **Prereqs:** A quote with pricing built.
- **Beats:** (1) Switch to **Document** tab. (2) Type/format text (headings, lists, alignment). (3) **Insert Field** → `{{client.company_name}}`, `{{tenant.logo}}` (show live preview substitution). (4) Insert an image. (5) **Two-column layout** (new in 0.51) — show the dashed column affordance. (6) Insert a **page break**.
- **Say:** Auto-saves independently from the quote metadata. Variables resolve at Preview/PDF time. Logos render inline.
- **Avoid:** AI writing is video 13; pricing tables are video 9 — mention, don't demo. Editor canvas follows light/dark theme, but the **PDF is always light/branded**.
- **Help link:** `/help#document`

### 9 · Adding pricing tables to the document  ·  ~2 min · Owner/Member
- **Goal:** Place a live pricing table in the proposal body.
- **Prereqs:** A quote with ≥2 scenarios.
- **Beats:** Document → **Insert** menu → **Pricing table**; choose **Recommended / All / a specific** scenario; show the in-editor live preview; Preview to confirm it renders with discounts/setup/tax.
- **Say:** The block stores a **reference**, not a snapshot — edit pricing and the table updates. Pricing is **optional/where-you-place-it**; no auto-append. Preview warns if there's no pricing table.
- **Avoid:** Don't imply pricing appears automatically.
- **Help link:** `/help#document`

### 10 · Preview & PDF  ·  ~2 min · Owner/Member
- **Goal:** Preview the proposal and download the PDF.
- **Prereqs:** A finished quote+document.
- **Beats:** (1) **Preview** button → full-screen iframe modal. (2) Right panel → **PDF Options**: toggle **running header/footer**. (3) **Download PDF**.
- **Say:** Preview flushes saves first, so it's always current. **Running header/footer are print-only** — they show in the PDF, not the on-screen Preview (call this out so they're not confused).
- **Avoid:** If `PDF_SERVICE_URL` isn't set the download 501s — make sure the demo env is wired before recording.
- **Help link:** `/help#document`

### 11 · Sending for signature (DocuSeal)  ·  ~4 min · Owner/Member
- **Goal:** Add signature fields and send the quote for e-signature.
- **Prereqs:** A finished quote; client has a valid email; a secondary signer set (optional, to show 2 signers).
- **Beats:** (1) Document → **Insert** → **Signature** (choose signer = Client / Company); optionally an **initials / acceptance checkbox / multiple-choice** field. (2) **Send for signature** → modal: confirm signers (prefilled), sequential vs parallel order, custom message. (3) Send. (4) Show status badge → **sent**; explain viewed → signed lifecycle.
- **Say:** Status is **system-managed** (webhook flips viewed/signed/declined); you can't send once valid-until has passed. Keep radio option labels short (<30 chars).
- **Avoid:** DocuSeal is on the **sandbox** — don't send to a real client address on camera; use a demo inbox. Don't show tokens/webhook URLs.
- **Help link:** `/help#sending`

---

## Recording order recommendation
Record in **dependency order** so the demo tenant builds naturally: **2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11**, then record **1 (Quick Start) last** using the polished tenant. This avoids re-seeding data mid-series.

---

## Open questions to decide
- ~~Format~~ → **A (locked).**  ~~Hosting~~ → **Loom (locked).**  ~~Sample data~~ → **clean demo tenant (recommended).**
1. **Scope for v1:** just Tier 1 (11 videos), or Tier 1 + a few Tier 2?
- ~~Narration~~ → **natural founder voice (locked).**
- ~~Demo tenant~~ → **"Northwind IT" (locked)** — spin up a clean demo tenant with the seed data above; sample products/clients/numbers are fixed in the scripts.

## Notes / parking lot
- Keep each Tier-1 video mapped to an existing Help topic so we can deep-link from the "?" contextual help.
- Document editor is now on **BlockNote 0.51.4** (upgrade already shipped) — so videos 8/9/13 can be recorded against the current UI. Cover the new **two-column layout** in video 8.
