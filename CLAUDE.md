# MSP QuoteBuilder — Project Context

## ⚠️ Workflow rule
**Netlify "Stop builds" is ENABLED** — pushes to `main` no longer trigger builds or consume free-tier minutes. So: **commit AND push freely after each change** (GitHub = backup/visibility). **Deploys are manual:** Netlify dashboard → Build settings → un-stop builds → Deploys → Trigger deploy → (optionally re-enable Stop builds). When the user says "deploy", remind them of those dashboard steps — a push alone no longer updates the live site.

## What This App Does
Multi-tenant SaaS web application for Managed Service Providers (MSPs) to create, manage, and send professional proposals/quotes to clients.

## Tech Stack
- **Next.js 14.2** (App Router, TypeScript) — data via server components + direct Supabase client calls (no React Query; it was unused and removed)
- **Supabase** (Postgres + Auth + RLS + Storage) — project: `pibipcdkxtldjbrsdbua`
- **Tailwind CSS** with CSS variable theming
- **BlockNote 0.14** (block editor — ✅ integrated as the Document editor)
- **Puppeteer + pdf-lib** (PDF generation — ✅ built, `/pdf-service` deployed on Railway)
- **Google Gemini 2.5-flash** (AI writing + pricing extraction)
- **mammoth** (.docx import)
- **DocuSeal** (e-signature — not yet built; pairs with the Send flow)

## Current State (as of last session)

### ✅ Completed

#### Infrastructure
- Next.js 14 project scaffolded with TypeScript, Tailwind, App Router
- Supabase browser + server clients configured (`lib/supabase/client.ts`, `lib/supabase/server.ts`)
- Auth middleware protecting all routes, redirecting unauthenticated users to `/login`
- Toast notification system (`components/ui/toast.tsx`) wired into all save operations
- `useTenantId()` hook for client-side tenant resolution (`lib/supabase/use-tenant.ts`)

#### Database
- Full schema deployed to Supabase (`supabase/schema.sql`)
- All 13 tables with RLS policies enforcing tenant isolation
- `provision_tenant()` SQL function for onboarding new tenants — **manual runbook in `docs/manual-tenant-onboarding.md`** (create Auth user → `provision_tenant(...)` with the UID → owner logs in). No self-serve onboarding / Super Admin / invite flow yet (backlog).
- Quote number generation handled server-side in `/api/quotes` (not via DB trigger, to avoid NULL constraint issues)

#### Manual Setup Completed (one-time)
1. **Tenant provisioned** — ran `provision_tenant()` in Supabase SQL editor:
   - Tenant: CMIT Hayward
   - Owner: `sameer@cmithayward.com`
   - 6 product categories seeded: Managed Services, Hardware, Software, Security, Cloud, Professional Services
2. **Products imported** — uploaded `Product-export.csv` via `/products` → "Import CSV"
   - 68 unique products imported (CSV parser handles multi-line quoted descriptions)
   - Products grouped by Zomentum ID; multiple pricing tiers per product supported
3. **Client added** — via `/clients` → "Add Client"
4. **Quote created** — via `/quotes` → "New Quote"
   - Quote auto-assigned a number (prefix + year + sequence, e.g. `CMIT-2026-001`)
   - 3 scenarios added within the quote editor

#### Pages / Features Built
| Route | Status | Notes |
|---|---|---|
| `/login` | ✅ | Email/password via Supabase Auth |
| `/` | ✅ | Dashboard with quote + client counts |
| `/clients` | ✅ | Card grid, add/edit drawer, duplicate validation on blur |
| `/products` | ✅ | Table with search/filter, CSV import, edit drawer with pricing tiers |
| `/quotes` | ✅ | Defaults to **"My Quotes"** (creator filter: mine/all/per-teammate; amber read-only badge on teammates' rows for members), status badges, New Quote modal w/ "Start from template" |
| `/quotes/[id]` | ✅ | Full quote editor (see below) |
| `/templates` | ✅ | Template list + editor (see Templates in Next Up) |
| `/settings` | ✅ | Company Settings + Quote Defaults + Team (member invites) |
| `/admin` | ✅ | Platform Admin console — tenant list + invite-first onboarding (platform admins only) |
| `/auth/set-password` | ✅ | Invite-acceptance landing (invited user sets password) |

#### Quote Editor (`/quotes/[id]`)
- Top bar: editable title, **read-only status badge** (status is SYSTEM-managed — see `lib/quote-status.ts`: send route sets `sent`, webhook sets viewed/signed/declined, `expired` is DERIVED from valid_until for sent/viewed, never stored; client NEVER writes `status` — prevents a stale-editor overwrite race vs the webhook), Profit margins toggle, Preview + Send/Re-send buttons, auto-save indicator. Send is blocked when valid_until has passed (extend first). **Stale drafts** (no activity > `default_valid_days`) are hidden from Quotes list + Dashboard (`isStaleDraft`, basis `updated_at`); raise Default Valid Days in Settings to reveal
- **Scenario tabs** — add/rename/delete scenarios, star one as Recommended
- **Line items table** — inline-editable description, billing period, qty (integers), unit price, **Disc** (per-line discount, **% or fixed $** via selector — mutually exclusive, stored in `discount_percent`/`discount_amount`; all totals/tax/margins compute on discounted price via `lineRevenue()`, floored at 0), totals; margin column (toggle). Client-facing tables (serializer + inline doc preview) show a Discount column + green **"You save $X"** row only when a discount exists
- **Setup fees** — a line's `setup_price` (copied from the catalog product on add; per-unit = `quantity × setup_price`, `lineSetup()`) is a **one-time charge folded into the one-time total** (and the taxable base when the line is taxable), in the editor totals, the right-panel tiles, AND the PDF/Preview (serializer `calcTotals` + per-line "+ $X setup (one-time)" note + "One-Time (incl. $Y setup)" footer annotation). Setup is **not** discounted. Editable per-product in the Product drawer (Details → Setup Price). NOTE: persisted scenario totals refresh on next scenario edit — older quotes with setup fees show correct live totals immediately but their stored `onetime_total` updates when next touched.
- **Add from catalog** — spotlight search overlay; shows pricing tier buttons for multi-tier products
- **Add free-text item** — blank row for custom line items
- **Right panel** — valid until, tax rate (READ-ONLY — company-wide rate from `tenant_settings.default_tax_rate`, set in Settings → Company Settings; `quotes.tax_rate` is a synced snapshot written on save for PDFs/back-compat), payment terms, internal notes, client info card, scenario totals (Monthly / One-time per scenario)
- **No manual Save button** — everything auto-saves (see Auto-save model below)
- **Responsive/space controls** — line-items table wraps in `overflow-x-auto` (scrolls right when margins+tax columns exceed width); right details panel is **collapsible** (chevron toggle, persisted `localStorage["quote.rightPanel"]`); the app nav **`Sidebar` collapses to an icon rail** (persisted `localStorage["sidebar.collapsed"]`, `PanelLeftClose/Open` toggle) — applies to all dashboard pages

#### Document Editor (BlockNote) — `components/quotes/proposal-editor.tsx`
- **Second tab** ("Document") inside the quote editor for the proposal narrative body
- Built on **BlockNote 0.14** (`@blocknote/react` + `@blocknote/mantine`); lazy-loaded via `dynamic(ssr:false)`
- **Custom `pageBreak` block** (`createReactBlockSpec`, `content:"none"`) — renders a dashed "✂ Page Break" divider; emits `data-page-break="true"` for the future Puppeteer PDF generator. Insertable via slash menu (`/page break`)
- **Persistent toolbar** — alignment buttons (left/center/right) + "Insert Field" dropdown
- **Insert Field dropdown** — inserts `{{client.*}}` / `{{tenant.*}}` variable tokens as styled inline text (violet theme, shows live preview values from client/tenant data). Tokens: `company_name, contact_name, email, phone, address, logo` for both client and tenant. **`{{client.logo}}` / `{{tenant.logo}}` render as inline `<img>`** at PDF/Preview time (serializer post-substitutes them after escaping; logos resolved into `imageUrlMap` by `load.ts`). Client logo uploaded in the client drawer (`clients.logo_url`, migration 003)
- **Image upload** — to Supabase Storage bucket `proposal-assets` via custom `sb-storage://` URL scheme; `resolveFileUrl` generates 1-hour signed URLs
- Content stored in `quotes.document_content` (JSONB)

#### Auto-save model (no Save buttons anywhere)
- **Quote metadata** (`quote-editor.tsx`): debounced `useEffect` (1s) keyed on title/status/valid_until/tax_rate/payment_terms/notes/showMargins → updates `quotes` row. First render skipped. Live "Saving… / Saved ✓" indicator in top bar
- **Document body** (`proposal-editor.tsx`): direct `editor.onChange()` subscription → debounced save (1.5s) → updates `quotes.document_content` only. Flushes on unmount + `beforeunload`. Own "Saving… / Saved ✓" indicator
- **Line items / scenarios**: persist immediately on each edit (no debounce)
- The two debounced saves write **different columns of the same `quotes` row** independently

#### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/auth/callback` | GET | Supabase OAuth code exchange |
| `/api/products/import` | POST | CSV bulk import (multipart/form-data) |
| `/api/quotes` | POST | Create quote + default scenario (server-side, bypasses trigger ambiguity) |
| `/api/quotes/[id]/preview` | GET | Returns the proposal as standalone HTML (iframe Preview source) |
| `/api/quotes/[id]/pdf` | GET | Serializes quote→HTML, POSTs to Puppeteer service, returns PDF download |
| `/api/quotes/[id]/duplicate` | POST | Clones quote + scenarios + line items + document into a fresh draft |
| `/api/ai/write` | POST | Gemini Flash AI writing assistant (improve/expand/shorten/grammar/tone/generate/continue) |
| `/api/ai/extract-pricing` | POST | Gemini JSON mode: document tables → proposed scenarios + line items, classified against catalog |
| `/api/documents/parse-docx` | POST | mammoth .docx → HTML |
| `/api/quotes/[id]/apply-pricing` | POST | Creates scenarios + line items from reviewed extraction; link/create(+audit)/freetext per item |
| `/api/quotes/[id]/send` | POST | DocuSeal: build signing HTML → create submission (client + MSP counter-sign) → records signers/session, sets quote `sent` |
| `/api/webhooks/docuseal` | POST | DocuSeal webhook (secret-checked): updates signer/session/quote status (viewed→signed/declined), stores signed PDF URL |

#### PDF / Preview pipeline ✅ (renderer needs Railway deploy)
- **Serializer** (`lib/pdf/serialize.ts`) — pure function: BlockNote blocks → print-ready HTML. Handles token substitution (`{{client.*}}`/`{{tenant.*}}`), `pageBreak`→CSS `page-break-after`, `scenarioTable`→live pricing tables, inline styles, lists, images, `table` blocks. **Recurses into block `children`** (nested content, e.g. a table nested under a paragraph). Includes full `<style>` (Letter @page, scenario table styling). NOTE: `gatherTables()` in `proposal-editor.tsx` (pricing extraction) also recurses children — nested tables were previously missed
- **Image resolution** (`lib/pdf/resolve-images.ts`) — pre-resolves `sb-storage://` URLs → signed URLs into a map so the serializer stays sync
- **Data loader** (`lib/pdf/load.ts`) — fetches quote+scenarios+line_items+client+tenant+image map → `SerializeInput`
- **Inline Scenario block** — custom `scenarioTable` block (`proposal-editor.tsx`), insertable via slash menu (`/pricing`). Stores a *reference* (`scenarioRef`: `recommended`|`all`|specific id), NOT a snapshot, so tables stay live. In-editor live preview fed by `ScenarioContext` (provides current scenarios+taxRate, since BlockNote block renders can't take parent props)
- **Pricing is OPTIONAL** — serializer renders pricing only where the author placed a `scenarioTable` block (no auto-append). On Preview, if the live document has no pricing table, `quote-editor` shows a `toast.warning` but proceeds. `ProposalEditor` exposes `onReady({ saveNow, hasPricingTable })` for this check + the pre-preview save flush
- **Preview** — "Preview" button in quote editor header opens a full-screen modal with an `<iframe>` pointing at the preview route; flushes document + metadata saves first so preview is current. "Download PDF" button links to the pdf route. NOTE: running header/footer are print-only (Puppeteer) so they do NOT appear in the on-screen iframe Preview
- **Running header/footer** — stamped by the pdf-service with **pdf-lib** AFTER Puppeteer renders (not Puppeteer's displayHeaderFooter, because page numbers must be offset). Header: tenant name (left) + quote number (right); footer: "Confidential — prepared for {client}" (left) + "Page X of Y" (right). **Skips the cover (page 1)**; numbering starts at 1 on the second physical page, total = body page count (N-1). The pdf route sends `{ html, headerFooter, meta }`; `meta` from `buildHeaderFooterMeta()`. Per-document toggle via `quotes.include_header_footer` (default true) — checkbox in the editor's right panel "PDF Options". NOTE: header/footer are print-only — they do NOT appear in the on-screen iframe Preview
- **Puppeteer service** (`/pdf-service`) — standalone Express + Puppeteer, `POST /render {html}` → PDF. Dockerfile uses `ghcr.io/puppeteer/puppeteer` base. **Deploy to Railway**, then set `PDF_SERVICE_URL` + `PDF_SERVICE_TOKEN` in the main app env. See `pdf-service/README.md`
- **Env vars needed**: `PDF_SERVICE_URL`, `PDF_SERVICE_TOKEN` (PDF download returns 501 until set)

#### Known Fixes Applied
- PostgREST FK disambiguation: `quote_scenarios!quote_id(...)` required because `quotes` ↔ `quote_scenarios` has two FK paths (`quote_id` and `selected_scenario_id`)
- CSV parser rewrote to handle multi-line quoted fields (descriptions with embedded newlines)
- Client-side inserts include `tenant_id` explicitly (RLS requires it)
- Quote number generated in API route, not DB trigger, to avoid NULL constraint when `tenant_settings` row is missing
- **BlockNote "Position undefined out of range" crash** — custom `content:"none"` blocks (pageBreak) crash if loaded via `initialContent`, because the node view renders before ProseMirror's view exists and `getPos()` returns undefined. **Fix:** create the editor empty, then load saved content with `editor.replaceBlocks()` inside a `requestAnimationFrame` (post-mount, after view attaches). A `contentLoaded` ref guards against double-load; a `skipNextChange` ref suppresses the echo-save from the programmatic load
- `reactStrictMode: false` in `next.config.mjs` — safeguard against BlockNote 0.14 editor double-mount under StrictMode (not the crash fix itself; remove once BlockNote is upgraded)
- ProposalEditor uses an `onSaveReady` callback prop pattern (NOT `forwardRef`) — `forwardRef` conflicts with `dynamic()` and triggers extra render cycles. (Currently unused by parent since the manual Save button was removed, but the prop remains available)

## ⚠️ PENDING MIGRATIONS (run in Supabase SQL editor)
- `001_add_include_header_footer.sql` — header/footer toggle column
- `002_product_provenance_and_audit.sql` — `products.source` + `products.source_quote_id` + `product_audit` table + RLS. **Required for the "Extract pricing → scenarios" feature** (creating catalog products writes provenance + audit).
- `003_add_client_logo.sql` — `clients.logo_url`. **Required for client logo upload + the `{{client.logo}}` document field.**
- `004_add_decline_reason.sql` — `quote_signers.decline_reason`. **Required for capturing DocuSeal decline comments** (webhook writes it + appends to quote notes).
- `005_add_line_item_discount.sql` — `quote_line_items.discount_percent` + recreates the `line_total`/`margin_percent` generated columns discount-aware. **Required for the Discount column.** ✅ run
- `006_add_discount_amount.sql` — `quote_line_items.discount_amount` (fixed $ off the line total; UI keeps %/$ mutually exclusive per line) + generated columns recreated again. **Required for the $ discount option.** ✅ run (Discount %/$ + Preview verified on CMIT-2026-008)
- `007_platform_admins_and_invites.sql` — `platform_admins` (RLS, NO policies — service-role only) + `tenant_invites` (+ tenant-member read policy) + `provision_tenant_shell()` (ownerless tenant) + seeds Sameer as platform admin. **Required for the /admin console, invite-first tenant onboarding, and Settings → Team.** ✅ run (invite flow verified end-to-end 2026-06-10 with sales@cmithayward.com).
- `008_quote_ownership_rls.sql` — `quotes.created_by` + `templates.created_by` (backfilled to tenant owner) + helpers (`is_tenant_owner()`, `can_edit_quote()`, `can_edit_scenario()`, `next_quote_number()` — atomic sequence bump, replaces the route's read-then-update) + **full RLS policy rewrite** (reads tenant-wide; quote/template writes creator-or-owner; products/settings/client-edits owner-only; clients insert open to members). ✅ run (roles checklist passed 2026-06-11). See `docs/roles-permissions-design.md`.
- `009_realtime_quote_changes.sql` — adds `quotes`/`quote_scenarios`/`quote_line_items` to the `supabase_realtime` publication + `replica identity full` on scenarios/line items (DELETE events need quote_id/scenario_id for client filtering). **Required for the live-refresh feature** (remote saves + webhook status flips appearing in open editors). Presence chips work WITHOUT this migration. ✅ run (presence + live scenario/line-item refresh verified two-user 2026-06-11; **webhook status-flip live update still untested** — needs the Netlify deploy, see backlog #15). Also one-time Supabase Auth config: add `https://ultraquote.netlify.app/auth/set-password` + `http://localhost:3000/auth/set-password` (or `…/**` wildcards) to Auth → URL Configuration → Redirect URLs — invite links land DIRECTLY on /auth/set-password (no query string: allowlist matching silently falls back to the Site URL when query params are involved).

## ⏸️ RESUME SNAPSHOT (last session end: 2026-06-11 PM)
**Where things stand:**
- **LIVE on Netlify: https://ultraquote.netlify.app** · GitHub `spandya007/ultraquote` `main` (in sync, through `94b3d09`). PDF service on Railway healthy. **Netlify "Stop builds" is ON** — ⚠️ **growing deploy gap: the live site is still pre-Discount code.** Everything since (Discount, tenant onboarding, roles/ownership, template UX, realtime, CSV import rework, setup fees, UI collapse) is local/GitHub only and needs a manual deploy (dashboard: un-stop builds → Trigger deploy). Migrations 007/008/009 are run in Supabase (shared by local + prod), so the DB is ahead of the live code.
- **THIS SESSION (2026-06-11 PM), all ✅ tested on localhost + pushed:** (1) **/quotes "My Quotes" default** + creator filter (mine/all/per-teammate) + amber read-only badge on teammates' rows; (2) **Template UX redesign** — apply-at-creation only (New Quote "Start from" + /templates "New quote" button), Document toolbar now a single "Save as template" popover; (3) **Realtime presence (Tier 1)** chips + **live refresh (Tier 2)** of scenarios/line-items (migration 009) — webhook status-flip live test still pending the deploy (backlog #15); (4) **CSV import made system-neutral** (alias headers, only Item Name required, "CSV format" popover + sample template) + `docs/product-fields-reference.md`; (5) **Setup fees** — editable in Product drawer + per-tier live margin + flow into quotes (editable **Setup column** in line items, one-time total, inline doc table note, PDF note); (6) **UI space controls** — collapsible left nav (icon rail) + collapsible quote right-panel + horizontal scroll on the line-items table; (7) bug fixes: product-drawer insert missing `tenant_id` (RLS), Add-tier scroll-into-view, stable tier React keys.
- **Multi-tenancy ✅ TESTED**: invited a 2nd tenant **Pandya's** (`sameer@pandyas.us`) end-to-end — empty/isolated, own seeded categories, own quote numbering. `sales@cmithayward.com` password was reset to a temp via admin API this session (no self-serve reset UI yet → backlog #17).
- **NEW: Tenant onboarding ✅ TESTED END-TO-END** (backlog #11): `/admin` Platform Admin console (invite-first tenants, user/quote counts as future billing basis), Settings → Team member invites (invite/resend/revoke), `/auth/set-password` acceptance. Migration 007 ✅ run; Supabase Auth redirect URLs allowlisted (`…/auth/set-password` for prod + localhost — invite links land DIRECTLY there, no query string, implicit-flow `#hash` tokens handled client-side). **Custom SMTP configured: Zoho** (`smtp.zoho.com:465`, user `sameer@cmithayward.com` + Zoho app password; sender must equal the authenticated mailbox). Verified: invite email → set password → landed in CMIT Hayward as member `sales@cmithayward.com`. Invite email template can use `{{ .Data.tenant_name }}`/`{{ .Data.full_name }}`/`{{ .Data.role }}`. NOTE: Supabase email rate limit (Auth → Rate Limits) may still be at the default ~30/hr — bump when onboarding for real.
- **NEW: Roles & quote ownership ✅ TESTED 2026-06-11** (backlog #14, design `docs/roles-permissions-design.md`, migration 008 ✅ run): creator-owned quotes/templates (owner can always edit; others read-only w/ amber banner + Duplicate), duplicate open to all members, products/settings/client-edits owner-only (clients add-only for members), Extract pricing owner-only, Created-by column on /quotes. Enforced in RLS + UI. Quote numbers via atomic `next_quote_number()` RPC.
- Also this session: Team card green "active" badges; sidebar "Hello, <first name>" greeting; `tenant_name` in invite metadata.
- **DocuSeal Send flow FULLY TESTED end-to-end** (sandbox; previous session). Webhook secret is URL-encoded in the DocuSeal webhook URL (rotate to hex — tech debt). **DocuSeal is on the free Developer Sandbox** — upgrade to Pro ($20/mo + $0.20/doc) + production key/webhook before real clients.
- **Quote lifecycle is SYSTEM-MANAGED** (`lib/quote-status.ts`): no status dropdown; client never writes status; signed terminal; `expired` derived from valid_until; stale drafts hidden (basis updated_at).

**Backlog (for prioritization):** #17 self-serve password reset + change password ✅ DONE (needs manual test). Open feature menu (no forced next): dark mode (#7), product docs polish (#8), BlockNote upgrade + two-column (#10), Withdraw (#12), offline-sign (#13), CSV mapping wizard (#16); tech debt: hex webhook secret, Next major upgrade, Supabase email rate-limit bump, signed-quote content immutability (candidate, not yet backlogged). Tenant onboarding (#11) + roles/ownership (#14) + realtime (#15) all ✅ shipped + tested.

## Next Up (not yet built)
- [x] ~~BlockNote document editor tab on quote (proposal narrative body)~~ ✅ DONE
- [x] ~~PDF generation + Preview~~ ✅ DONE (deployed to Railway; header/footer + per-document toggle)
- [x] ~~Templates~~ ✅ DONE — `/templates` page (`templates-client.tsx`): list/rename/describe/soft-delete (`is_active=false`), "Open editor" link → `/templates/[id]` (`template-editor.tsx`) which reuses **`ProposalEditor` in `isTemplate` mode** (saves to `templates.document_content`; quote-only actions Extract pricing + Templates dropdown hidden; pricing-table block shows a placeholder note when no scenarios). **Template UX redesigned 2026-06-11 (user request):** applying is **creation-only** — New Quote modal has a "Start from: Blank / <template>" selector (`/api/quotes` copies `document_content` + sets `quotes.template_id`); `/templates` cards have a **"New quote"** button (opens the New Quote modal with that template preselected); the Document-toolbar dropdown was replaced by a single **"Save as template"** popover (no mid-document apply; `insertBlocksIntoDoc` remains for .docx/.md Import). `/templates` uses `router.refresh()` on view to dodge the App Router cache.
- [x] ~~E-signature + Send flow (DocuSeal)~~ ✅ DONE (code) — **`/signature` block** (`signatureField`, signer=client|tenant) → serializer emits DocuSeal **element field tags** (`<signature-field>`/`<text-field>`/`<date-field>` with role=Client|Company) only in **signing mode** (`buildSigningHtml`), a plain signature line in normal Preview/PDF. **"Send for signature"** button → modal (client + your-company signers, prefilled) → `/api/quotes/[id]/send` builds signing HTML, calls DocuSeal `/submissions/html` (payload key is `documents[].html` — NOT `file`, which yields a blank doc; sequential or parallel order user-selectable, `send_email:true`, custom `message` subject/body + `reply_to`), records `quote_signers` + `quote_signature_sessions`, sets quote `sent`. **`/api/webhooks/docuseal`** (service-role admin client, `?secret=` checked) maps `form.viewed/completed/declined` → updates signers/session/quote (`viewed`→`signed`/`declined`) + stores signed PDF URL. **Needs env: `DOCUSEAL_API_TOKEN`, `DOCUSEAL_WEBHOOK_SECRET` + webhook configured in DocuSeal console.** Uses `/submissions/html` (DocuSeal renders) — can upgrade to PDF-based for exact fidelity later.
- [x] Settings page ✅ — card renamed **Company Settings** (name/contact/email/phone/address/logo + **company Tax Rate**, saved to `tenant_settings.default_tax_rate` via upsert) + Quote Defaults card (prefix, valid days, payment terms). Quote editor consumes the company rate via `companyTaxRate` prop (quotes/[id]/page fetches tenant_settings).
- [x] ~~Dashboard — meaningful stats~~ ✅ DONE — `app/(dashboard)/page.tsx`: open-pipeline value, monthly-recurring (open), won/win-rate, active clients; quotes-by-status bars; expiring-soon (≤14d); recent quotes. Uses each quote's recommended (or first) scenario totals. `force-dynamic`.

### Backlog / Reminders (user-requested — do not lose)
1. ~~**AI writing assistance in the Document**~~ ✅ DONE — **`gemini-2.5-flash`** via `POST /api/ai/write` (key server-side, `GEMINI_API_KEY`). NOTE: 2.5-flash is a thinking model — request sets `thinkingConfig.thinkingBudget: 0` so the token budget goes to output (otherwise it truncates). "Ask AI" toolbar dropdown in `proposal-editor.tsx`: selection actions (Improve/Make longer/Make shorter/Fix grammar/Change tone) + Generate-from-prompt + Continue writing. Context-aware (client/tenant/pricing grounding). **Preview-before-apply**: AI result is staged in a review modal (original strikethrough vs suggested) with Replace/Discard — the target range is captured up-front and applied via `insertContentAt({from,to})`. Toolbar also has **Undo/Redo** (TipTap history).
2. ~~**Duplicate a Quote**~~ ✅ DONE — `POST /api/quotes/[id]/duplicate` clones quote + scenarios + line items + document_content into a fresh draft (new quote number, title + " (Copy)"); "Duplicate" button per row in `quotes-client.tsx` → navigates to the copy.
5. ~~**Import/upload Document from `.docx` or `.md`**~~ ✅ DONE — "Import" button in `proposal-editor.tsx` toolbar. `.md`/`.txt` parsed client-side via `editor.tryParseMarkdownToBlocks`; `.docx` → `POST /api/documents/parse-docx` (mammoth → HTML) → **custom `lib/import/html-to-blocks.ts`** converter (BlockNote 0.14's `tryParseHTMLToBlocks` mangles `<table>` — empty shell + content dumped into `children`; our converter builds proper `tableContent` rows/cells, plus headings/lists/links/images). Serializer (`serialize.ts`) now renders `table` blocks (`.doc-table`). Fills an empty doc (replaceBlocks) or inserts at cursor. NOTES: merged cells (colspan/rowspan) not supported (flattened); mammoth embeds images as base64 data URIs → can bloat `document_content`. Reusable for Templates.
6. ~~**Tenant logo**~~ ✅ DONE — `tenants.logo_url` (column already existed). Upload UI in Settings → Company Profile (`settings-client.tsx`): uploads to `proposal-assets/tenant-logos/{tenantId}/...`, stores `sb-storage://` URL, signed-URL preview. Rendered on the PDF/Preview **first page** (`.doc-logo` above `doc-header` in `serialize.ts`); `load.ts` resolves the logo into the image map. NOT in the running header.
7. **Dark mode** — add a dark-mode toggle/setting in the UI. Tailwind is already CSS-variable themed (`app/globals.css` has `.dark` tokens); needs a theme toggle + persistence (e.g. `next-themes` or a `class` on `<html>`).
9. ~~**Document pricing tables → scenarios**~~ ✅ DONE — "Extract pricing" button in Document toolbar. `/api/ai/extract-pricing` (Gemini JSON) extracts line items grouped into scenarios + classifies each against the catalog (conservative normalized-name match). Review modal: per-item action — **link** (duplicate → forced catalog values), **create** (new product in Professional Services + `product_audit`), or **freetext**. `/api/quotes/[id]/apply-pricing` creates scenarios+line items; replaces the lone empty default scenario, caps at 5. **Create-dedup:** a normalized-name map (seeded from the catalog, extended per run) ensures the same service across multiple scenarios maps to ONE catalog product (line items keep their own quoted price). Parent refreshes via `onPricingApplied`. **Needs migration 002.**
10. **BlockNote upgrade + two-column layout** — upgrade `@blocknote/*` from 0.14 → 0.51 to enable `@blocknote/xl-multi-column` (true two-column documents) and fix the `getPos` StrictMode crash (re-enable `reactStrictMode`). **High-risk, dedicated effort on a worktree** — confirmed breaking changes (custom-block factory API, schema `.extend()`, render signature) + existing-document compatibility risk. Full research, breaking-change list, migration plan, and test matrix in **`docs/blocknote-upgrade-plan.md`**.
11. ~~**Tenant onboarding + Super Admin / invites**~~ ✅ DONE + **tested end-to-end 2026-06-10** (migration 007 run, redirect URLs configured, Zoho SMTP) — design doc: **`docs/tenant-onboarding-design.md`**. **Invite-first:** `/admin` console (own layout outside the dashboard shell; guarded by `platform_admins` via service role — `lib/platform-admin.ts`; sidebar shows a "Platform Admin" link for admins) lists tenants w/ **user counts (future billing basis — live count of `public.users`)**, quote counts, owner + invite-status badge; "Invite tenant" → `provision_tenant_shell()` (ownerless shell) → `inviteUserByEmail` with `tenant_id`/`role` metadata (the EXISTING `handle_new_auth_user` trigger creates the `users` row at invite time) → owner's email link lands DIRECTLY on `/auth/set-password` (no query string — Supabase's redirect allowlist mismatches URLs with query params and silently falls back to the Site URL) — NOTE: invite links are **implicit flow** (session tokens in the URL `#hash`, no `?code=`), so the **public** `/auth/set-password` page (middleware allows `/auth/*`) establishes the session client-side via `setSession()` from the hash → sets password → `POST /api/auth/accept-invite` marks the `tenant_invites` row accepted. **Member invites:** Settings → **Team** card (`components/settings/team-card.tsx`) — owner-only invite/resend/revoke via `/api/team/invite` + `/api/team/invites/[id]`; members see the list read-only. Shared mechanics in `lib/invites.ts`: **resend** = delete the still-unconfirmed auth user + `users` row, re-invite (same metadata); **revoke** = same delete + mark invite revoked; both refuse once accepted (`email_confirmed_at`/`last_sign_in_at`). Tenant-invite failure cleans up the shell tenant; revoking an owner invite keeps the tenant ("No owner" in console) for re-invite. Optional env `NEXT_PUBLIC_SITE_URL` overrides the redirect origin. Manual runbook stays as fallback (e.g. attaching an existing email to a tenant). Out of scope (listed in design doc): tenant delete/suspend, seat limits/Stripe, role changes, removing existing users, self-serve request queue.
12. **Withdraw action** — no way to "unsend" a sent quote (manual status control was removed). If needed: a deliberate Withdraw button that archives the DocuSeal submission and returns the quote to draft.
13. **Mark as signed (offline)** — `signed` is webhook-only; paper/offline signatures can't be recorded. If needed: explicit confirm action.
14. ~~**Roles, quote ownership & permissions**~~ ✅ DONE + **tested 2026-06-11** (migration 008 run; full owner/member checklist passed) — design doc: **`docs/roles-permissions-design.md`** (full matrix + confirmed decisions). Quotes/templates are **creator-owned** (`created_by`; tenant owner can always edit; others read-only); any member may **duplicate** any quote (copy becomes theirs); **products/settings/client-edits owner-only**, clients **add-only** for members; **Extract pricing owner-only**. Enforced in RLS (migration 008 policy rewrite) + UI (read-only quote editor w/ amber banner + Duplicate button, `fieldset disabled` regions, view-only drawers/settings, Created-by column on /quotes, creator shown on /templates). Quote numbers now allocated via `next_quote_number()` RPC (atomic, definer). Sidebar greets "Hello, <first name>"; Team card shows green **active** badges.
15. ~~**Realtime presence + live refresh**~~ ✅ DONE (migration 009 run; presence + two-user live scenario/line-item refresh **tested 2026-06-11**). ⚠️ **One test still pending — DO AFTER THE NEXT NETLIFY DEPLOY:** with a quote open in a browser, run a DocuSeal sandbox signing round and verify the status badge flips to viewed/signed **live** (webhook → quotes-row UPDATE → realtime adoption of system fields). Local can't receive the webhook, so this needs the deployed site. — **Presence (Tier 1):** `lib/realtime/use-presence.ts` (Realtime presence channel `presence:quote:<id>` / `presence:template:<id>`, keyed by auth uid) + `components/ui/presence-indicator.tsx` amber "X is also in this quote" chip in the quote + template editor headers. No DB config needed. **Live refresh (Tier 2):** quote editor subscribes to `postgres_changes` (scenarios filtered by quote_id; line items matched via scenario_id set; quotes row UPDATE adopts ONLY system-managed fields status/pdf_url/sent_at/signed_at — never free-text fields, which may be mid-edit) → debounced (600ms) `syncScenariosFromServer()` (preserves active scenario + tab, unlike `refreshScenarios`) with a **typing guard**: skipped+retried (2s) while focus is in an input/textarea/select, since our own immediate line-item saves echo back as events. Concurrency model remains last-write-wins (no optimistic locking/CRDT — Google-Docs-style co-editing deliberately out of scope; would need Yjs + BlockNote upgrade #10).
17. ~~**Self-serve password reset + change password**~~ ✅ DONE 2026-06-11 (code; ⚠️ not yet manually tested). **(a) "Forgot password?"** link on `/login` → `/auth/forgot-password` page (`forgot-password-form.tsx`) → `resetPasswordForEmail(email, { redirectTo: <origin>/auth/set-password })` (bare path — no query string; the URL is ALREADY allowlisted) → recovery email → lands on the EXISTING `/auth/set-password` page, now **recovery-aware**: reads `type=recovery` from the hash, swaps copy ("Choose a new password" for `email`, button "Update password"), and skips the accept-invite call. Always shows "check your email" (doesn't reveal whether the address is registered). **(b) "Change Password" card** in Settings (`change-password-card.tsx`, available to ALL users, not owner-gated) → `auth.updateUser({ password })`, no email round-trip. Recovery emails go via the configured Zoho SMTP (brandable "Reset Password" template; rate limits apply). NO new Supabase config needed (redirect URL already allowlisted). Test: Forgot password → email → link → set new password → login; and Settings → Change Password. **Password policy** (`lib/auth/password.ts` `validatePassword`/`checkPassword`, live checklist `components/auth/password-requirements.tsx`, used by set-password + change-password forms): ≥12 chars, ≥3 of 4 char classes, must not contain the email local-part, denylist of common passwords. ⚠️ Client-side only — **mirror server-side in Supabase: Auth → Policies set min length 12 + enable Leaked Password Protection (HIBP)** (built-in, no new service).
16. **CSV import mapping wizard** — upload any CSV → preview → map columns interactively → import. Only worth building once strangers onboard tenants regularly. Until then the importer (reworked 2026-06-11) is **system-neutral**: case-insensitive **header alias map** (`HEADER_ALIASES` in `lib/import/csv-products.ts` — extend a list whenever a real-world file shows a new spelling), only `Item Name` mandatory, rows grouped into one product + tier-per-row by legacy `Zomentum Id` (honored when present, never documented externally) else by name, re-import dedupe via zomentum_id else case-insensitive name (rename → new product), billing-period/item-type value variants accepted, owner-only route guard, parse errors name the found vs expected headers. `/products` has a "CSV format" popover + **sample template** (`public/product-import-template.csv`).
8. **Product user documentation** — turn `docs/user-guide-notes.md` (running draft notes on Quotes/Scenarios/Line Items/Margins/Document/Ask AI/Preview/PDF/Header&Footer/Logo/Settings) into polished end-user docs. Keep adding to the notes file as features ship. **Field reference:** `docs/product-fields-reference.md` documents which `products` columns are hidden in the UI (product-level `unit_cost`/`unit_price` superseded by tier pricing; integration IDs) and which 16 of the original 33 Zomentum CSV columns are dropped on import (foreign-system/PSA/CRM IDs). NOTE: `setup_price` is now editable (drawer Details → Setup Price, added 2026-06-11).
3. ~~**Preview feature**~~ ✅ DONE (in-app iframe modal sharing the PDF serializer).
4. **Quote ↔ Document relationship** — RESOLVED via the inline `scenarioTable` block: loosely integrated (document controls layout via placed pricing tables; line items remain the structured data). Revisit only if a tighter merge is wanted.

### Known follow-ups / tech debt
- **Rotate DOCUSEAL_WEBHOOK_SECRET to a hex-only value** (e.g. `openssl rand -hex 32`). The current secret contains `&`/`^` and only works because it's URL-encoded inside the DocuSeal webhook URL (`?secret=...`). On the next natural Netlify deploy: update the Netlify env var + put the new plain value in the DocuSeal webhook URL (no encoding needed), then Resend a test event to confirm 200.
- **POST-DEPLOY TEST (user-requested, backlog #15): live status flip on signing.** After the next Netlify deploy: keep a sent quote open in a browser, complete a DocuSeal sandbox signing round, and confirm the status badge updates to viewed → signed live (no reload) + the Signed PDF button appears. Local dev can't receive the DocuSeal webhook, so this can only be verified on the deployed site.
- Variable tokens are now substituted by `lib/pdf/serialize.ts` (tokenMap) at PDF/Preview render time
- Re-enable `reactStrictMode` once BlockNote is upgraded past the `getPos` bug
- PDF download returns 501 until `PDF_SERVICE_URL` is set (deploy `/pdf-service` to Railway)
- **Planned Next.js major upgrade** — currently pinned to `^14.2.35` (patched the two CVEs that blocked Railway). `npm audit` advisories keep accumulating on the Next 14 line; npm's only auto-fix is `next@16` (breaking). Schedule a deliberate, tested upgrade to a newer Next major. Pair with the BlockNote upgrade (above) so `reactStrictMode` can be re-enabled in the same pass.

## File Structure
```
/app
  /api/auth/callback/route.ts
  /api/products/import/route.ts
  /api/quotes/route.ts
  /api/quotes/[id]/preview/route.ts  ← proposal HTML (iframe source)
  /api/quotes/[id]/pdf/route.ts      ← HTML→Puppeteer→PDF download
  /api/quotes/[id]/duplicate/route.ts ← clone quote into a fresh draft
  /api/ai/write/route.ts             ← Gemini Flash AI writing assistant
  /api/documents/parse-docx/route.ts ← mammoth .docx → HTML (for Document import)
  /api/ai/extract-pricing/route.ts   ← document tables → scenarios (Gemini JSON) + catalog match
  /api/quotes/[id]/apply-pricing/route.ts ← create scenarios/line items + catalog products from review
  /api/admin/tenants/invite/route.ts ← Super Admin: provision tenant shell + email owner invite
  /api/admin/invites/[id]/route.ts   ← Super Admin: resend/revoke any invite
  /api/auth/accept-invite/route.ts   ← marks tenant_invites accepted after set-password
  /api/team/invite/route.ts          ← tenant owner invites a member
  /api/team/invites/[id]/route.ts    ← tenant owner resend/revoke member invite
  /(auth)/login/
  /admin/                     ← Platform Admin console (own layout; platform_admins-guarded)
    layout.tsx, page.tsx
  /auth/set-password/page.tsx ← invite-acceptance + password-recovery landing
  /auth/forgot-password/page.tsx ← request a password-reset email
  /(dashboard)/
    page.tsx                  ← dashboard home
    layout.tsx                ← auth guard + sidebar (+ platform-admin link check)
    /clients/page.tsx
    /products/page.tsx
    /quotes/page.tsx
    /quotes/[id]/page.tsx     ← quote editor
    /templates/page.tsx
    /settings/page.tsx
/components
  /ui/sidebar.tsx, login-form.tsx, toast.tsx
  /admin/admin-client.tsx     ← tenant table + invite-tenant form
  /auth/set-password-form.tsx, forgot-password-form.tsx
  /clients/clients-client.tsx, client-drawer.tsx
  /products/products-client.tsx, product-drawer.tsx
  /quotes/quotes-client.tsx, new-quote-modal.tsx, quote-editor.tsx, proposal-editor.tsx
  /settings/settings-client.tsx, team-card.tsx, change-password-card.tsx
/lib
  /supabase/client.ts, server.ts, admin.ts, use-tenant.ts
  /import/csv-products.ts
  /utils/cn.ts, format.ts
  /pdf/types.ts, serialize.ts, resolve-images.ts, load.ts  ← PDF/Preview pipeline
  platform-admin.ts           ← getPlatformAdminUser() guard
  invites.ts                  ← shared invite mechanics (send/resend/revoke)
/pdf-service/                 ← standalone Puppeteer microservice (deploy to Railway)
  server.js, Dockerfile, package.json, README.md
/types/index.ts               ← all TypeScript interfaces
/supabase/schema.sql          ← full DB schema + RLS policies
```
