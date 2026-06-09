# MSP QuoteBuilder — Project Context

## ⚠️ Workflow rule
**Do not `git push` after every change.** Netlify auto-deploys on each push to `main` and the user is on the free tier (build minutes). Commit locally as work lands; push only when the user asks ("push"/"deploy") or wants to test on the live site. Remind the user of unpushed commits before ending a session.

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
| `/quotes` | ✅ | Table with status badges, New Quote modal |
| `/quotes/[id]` | ✅ | Full quote editor (see below) |
| `/templates` | 🔲 | Stub page only |
| `/settings` | 🔲 | Stub page only |

#### Quote Editor (`/quotes/[id]`)
- Top bar: editable title, status dropdown, margins toggle, Save button
- **Scenario tabs** — add/rename/delete scenarios, star one as Recommended
- **Line items table** — inline-editable description, billing period, qty (integers), unit price, totals; margin column (toggle)
- **Add from catalog** — spotlight search overlay; shows pricing tier buttons for multi-tier products
- **Add free-text item** — blank row for custom line items
- **Right panel** — valid until, tax rate, payment terms, internal notes, client info card, scenario totals (Monthly / One-time per scenario)
- **No manual Save button** — everything auto-saves (see Auto-save model below)

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

## ⏸️ RESUME SNAPSHOT (last session end)
**Where things stand:**
- Code on GitHub `spandya007/ultraquote` (branch `main`).
- **✅ DEPLOYED to Netlify: https://ultraquote.netlify.app** (`netlify.toml` = `@netlify/plugin-nextjs`, Node 20). Env vars set (Supabase ×3, PDF_SERVICE_URL/TOKEN, GEMINI_API_KEY). Smoke-tested live: login, dashboard, document/AI/preview/**PDF download** (Railway), templates, clients, settings, sign out — all working. **Dev and prod share the same Supabase project** (`pibipcdkxtldjbrsdbua`).
- Post-deploy fixes: middleware matcher now excludes `manifest.webmanifest`/robots/sitemap/.ico (was 307→/login); **Download PDF** is now a fetch-based button with spinner ("Generating PDF…") + success/error toast.
- Recently also: removed unused React Query; app icons/branding from `docs/brand/uq512.png`; Sign out (confirm dialog); manual tenant-onboarding runbook (`docs/manual-tenant-onboarding.md`).
- **TODO on Supabase:** set Auth URL config — Site URL `https://ultraquote.netlify.app` + redirect `https://ultraquote.netlify.app/**` (needed for password reset / magic links / OAuth callback; email-password login already works).
- **Decision:** next = **DocuSeal Send flow** (now testable — public webhook + email available post-deploy), then **tenant onboarding/Super Admin** (backlog #11).
- **PDF service deployed on Railway** (Docker, `/pdf-service`), `/health` ok, auto-redeploys on push. **Web app NOT yet deployed to Netlify** (see `DEPLOY.md`).
- **Built, tested, working locally** (everything below): AI writing (Gemini 2.5-flash, retry on 429/503), Duplicate Quote, optional pricing + warning, scenario color-coding, scenario-delete guard, PDF header/footer (cover excluded, numbering from p2) + per-doc toggle, **Dashboard** (pipeline/status/expiring/recent), **Templates** (page + editor `/templates/[id]` + Save/Apply in Document toolbar), **Document import** `.docx/.html/.md` (custom `html-to-blocks`, tables), **Extract pricing → scenarios** (Gemini JSON + catalog match/create/freetext, dedup, confirm-before-add), **tenant logo** (Settings, first-page PDF) + sidebar branding, **client logo** (`{{client.logo}}` field, client cards), **app icons** (favicon/apple/PWA from `docs/brand/uq512.png`) + manifest + icon in sidebar/login, **Sign out** button (confirm dialog).
- Fixed: App Router cache staleness (`staleTimes:0` + `force-dynamic` on list pages; `router.refresh()` on /templates), duplicate quote-title rejection, nested-table extraction/serialization, toolbar reorg + tooltips.

**Outstanding manual steps:**
1. **Run pending migrations** in Supabase SQL editor (see "PENDING MIGRATIONS" above): `001` (header/footer — done earlier), `002` (product provenance/audit — done earlier), **`003_add_client_logo.sql`** (clients.logo_url — needed for client logo).
2. Restart `npm run dev` after any `next.config.mjs` change (staleTimes).
3. Netlify env vars (in `DEPLOY.md`): Supabase ×3, `PDF_SERVICE_URL`, `PDF_SERVICE_TOKEN`, `GEMINI_API_KEY`.

**Good next features:** DocuSeal e-sign + **Send flow** (do after Netlify deploy — needs public webhook + email) · Dark mode (#7) · BlockNote upgrade + two-column (#10, see `docs/blocknote-upgrade-plan.md`) · Polish product docs (#8, `docs/user-guide-notes.md`).

## Next Up (not yet built)
- [x] ~~BlockNote document editor tab on quote (proposal narrative body)~~ ✅ DONE
- [x] ~~PDF generation + Preview~~ ✅ DONE (deployed to Railway; header/footer + per-document toggle)
- [x] ~~Templates~~ ✅ DONE — `/templates` page (`templates-client.tsx`): list/rename/describe/soft-delete (`is_active=false`), "Open editor" link → `/templates/[id]` (`template-editor.tsx`) which reuses **`ProposalEditor` in `isTemplate` mode** (saves to `templates.document_content`; quote-only actions Extract pricing + Templates dropdown hidden; pricing-table block shows a placeholder note when no scenarios). Quote Document toolbar has a **Templates** dropdown: "Save current document as template" + "Apply a template" (shared `insertBlocksIntoDoc`). `/templates` uses `router.refresh()` on view to dodge the App Router cache.
- [x] ~~E-signature + Send flow (DocuSeal)~~ ✅ DONE (code) — **`/signature` block** (`signatureField`, signer=client|tenant) → serializer emits DocuSeal **element field tags** (`<signature-field>`/`<text-field>`/`<date-field>` with role=Client|Company) only in **signing mode** (`buildSigningHtml`), a plain signature line in normal Preview/PDF. **"Send for signature"** button → modal (client + your-company signers, prefilled) → `/api/quotes/[id]/send` builds signing HTML, calls DocuSeal `/submissions/html` (payload key is `documents[].html` — NOT `file`, which yields a blank doc; sequential or parallel order user-selectable, `send_email:true`, custom `message` subject/body + `reply_to`), records `quote_signers` + `quote_signature_sessions`, sets quote `sent`. **`/api/webhooks/docuseal`** (service-role admin client, `?secret=` checked) maps `form.viewed/completed/declined` → updates signers/session/quote (`viewed`→`signed`/`declined`) + stores signed PDF URL. **Needs env: `DOCUSEAL_API_TOKEN`, `DOCUSEAL_WEBHOOK_SECRET` + webhook configured in DocuSeal console.** Uses `/submissions/html` (DocuSeal renders) — can upgrade to PDF-based for exact fidelity later.
- [ ] Settings page — tenant profile, logo, quote number prefix, tax rate, payment terms (note: `tenants.contact_name` column + Company Profile field already added) ✅ (Settings built earlier)
- [x] ~~Dashboard — meaningful stats~~ ✅ DONE — `app/(dashboard)/page.tsx`: open-pipeline value, monthly-recurring (open), won/win-rate, active clients; quotes-by-status bars; expiring-soon (≤14d); recent quotes. Uses each quote's recommended (or first) scenario totals. `force-dynamic`.

### Backlog / Reminders (user-requested — do not lose)
1. ~~**AI writing assistance in the Document**~~ ✅ DONE — **`gemini-2.5-flash`** via `POST /api/ai/write` (key server-side, `GEMINI_API_KEY`). NOTE: 2.5-flash is a thinking model — request sets `thinkingConfig.thinkingBudget: 0` so the token budget goes to output (otherwise it truncates). "Ask AI" toolbar dropdown in `proposal-editor.tsx`: selection actions (Improve/Make longer/Make shorter/Fix grammar/Change tone) + Generate-from-prompt + Continue writing. Context-aware (client/tenant/pricing grounding). **Preview-before-apply**: AI result is staged in a review modal (original strikethrough vs suggested) with Replace/Discard — the target range is captured up-front and applied via `insertContentAt({from,to})`. Toolbar also has **Undo/Redo** (TipTap history).
2. ~~**Duplicate a Quote**~~ ✅ DONE — `POST /api/quotes/[id]/duplicate` clones quote + scenarios + line items + document_content into a fresh draft (new quote number, title + " (Copy)"); "Duplicate" button per row in `quotes-client.tsx` → navigates to the copy.
5. ~~**Import/upload Document from `.docx` or `.md`**~~ ✅ DONE — "Import" button in `proposal-editor.tsx` toolbar. `.md`/`.txt` parsed client-side via `editor.tryParseMarkdownToBlocks`; `.docx` → `POST /api/documents/parse-docx` (mammoth → HTML) → **custom `lib/import/html-to-blocks.ts`** converter (BlockNote 0.14's `tryParseHTMLToBlocks` mangles `<table>` — empty shell + content dumped into `children`; our converter builds proper `tableContent` rows/cells, plus headings/lists/links/images). Serializer (`serialize.ts`) now renders `table` blocks (`.doc-table`). Fills an empty doc (replaceBlocks) or inserts at cursor. NOTES: merged cells (colspan/rowspan) not supported (flattened); mammoth embeds images as base64 data URIs → can bloat `document_content`. Reusable for Templates.
6. ~~**Tenant logo**~~ ✅ DONE — `tenants.logo_url` (column already existed). Upload UI in Settings → Company Profile (`settings-client.tsx`): uploads to `proposal-assets/tenant-logos/{tenantId}/...`, stores `sb-storage://` URL, signed-URL preview. Rendered on the PDF/Preview **first page** (`.doc-logo` above `doc-header` in `serialize.ts`); `load.ts` resolves the logo into the image map. NOT in the running header.
7. **Dark mode** — add a dark-mode toggle/setting in the UI. Tailwind is already CSS-variable themed (`app/globals.css` has `.dark` tokens); needs a theme toggle + persistence (e.g. `next-themes` or a `class` on `<html>`).
9. ~~**Document pricing tables → scenarios**~~ ✅ DONE — "Extract pricing" button in Document toolbar. `/api/ai/extract-pricing` (Gemini JSON) extracts line items grouped into scenarios + classifies each against the catalog (conservative normalized-name match). Review modal: per-item action — **link** (duplicate → forced catalog values), **create** (new product in Professional Services + `product_audit`), or **freetext**. `/api/quotes/[id]/apply-pricing` creates scenarios+line items; replaces the lone empty default scenario, caps at 5. **Create-dedup:** a normalized-name map (seeded from the catalog, extended per run) ensures the same service across multiple scenarios maps to ONE catalog product (line items keep their own quoted price). Parent refreshes via `onPricingApplied`. **Needs migration 002.**
10. **BlockNote upgrade + two-column layout** — upgrade `@blocknote/*` from 0.14 → 0.51 to enable `@blocknote/xl-multi-column` (true two-column documents) and fix the `getPos` StrictMode crash (re-enable `reactStrictMode`). **High-risk, dedicated effort on a worktree** — confirmed breaking changes (custom-block factory API, schema `.extend()`, render signature) + existing-document compatibility risk. Full research, breaking-change list, migration plan, and test matrix in **`docs/blocknote-upgrade-plan.md`**.
11. **Tenant onboarding + Super Admin / invites** — NOT built. Today tenants are added by hand (`docs/manual-tenant-onboarding.md`). Wanted: a platform-level **Super Admin** role that invites/validates new MSP tenants → self-serve signup → becomes tenant owner. Needs: super-admin modeling (flag vs. `platform_admins` table), invite mechanism (Supabase `inviteUserByEmail` vs. custom `tenant_invites` table), approval/validation step, email, cross-tenant admin access (via service-role admin routes, not broad RLS). **Best after Netlify deploy** (needs email/invite links). Write a design doc first.
8. **Product user documentation** — turn `docs/user-guide-notes.md` (running draft notes on Quotes/Scenarios/Line Items/Margins/Document/Ask AI/Preview/PDF/Header&Footer/Logo/Settings) into polished end-user docs. Keep adding to the notes file as features ship.
3. ~~**Preview feature**~~ ✅ DONE (in-app iframe modal sharing the PDF serializer).
4. **Quote ↔ Document relationship** — RESOLVED via the inline `scenarioTable` block: loosely integrated (document controls layout via placed pricing tables; line items remain the structured data). Revisit only if a tighter merge is wanted.

### Known follow-ups / tech debt
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
  /(auth)/login/
  /(dashboard)/
    page.tsx                  ← dashboard home
    layout.tsx                ← auth guard + sidebar
    /clients/page.tsx
    /products/page.tsx
    /quotes/page.tsx
    /quotes/[id]/page.tsx     ← quote editor
    /templates/page.tsx       ← stub
    /settings/page.tsx        ← stub
/components
  /ui/sidebar.tsx, login-form.tsx, toast.tsx
  /clients/clients-client.tsx, client-drawer.tsx
  /products/products-client.tsx, product-drawer.tsx
  /quotes/quotes-client.tsx, new-quote-modal.tsx, quote-editor.tsx, proposal-editor.tsx
  /settings/settings-client.tsx
/lib
  /supabase/client.ts, server.ts, use-tenant.ts
  /import/csv-products.ts
  /utils/cn.ts, format.ts
  /pdf/types.ts, serialize.ts, resolve-images.ts, load.ts  ← PDF/Preview pipeline
/pdf-service/                 ← standalone Puppeteer microservice (deploy to Railway)
  server.js, Dockerfile, package.json, README.md
/types/index.ts               ← all TypeScript interfaces
/supabase/schema.sql          ← full DB schema + RLS policies
```
