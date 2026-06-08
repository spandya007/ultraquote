# MSP QuoteBuilder — Project Context

## What This App Does
Multi-tenant SaaS web application for Managed Service Providers (MSPs) to create, manage, and send professional proposals/quotes to clients.

## Tech Stack
- **Next.js 14.2** (App Router, TypeScript)
- **Supabase** (Postgres + Auth + RLS) — project: `pibipcdkxtldjbrsdbua`
- **Tailwind CSS** with CSS variable theming
- **TanStack React Query** (client-side caching)
- **BlockNote** (block editor — not yet integrated)
- **Puppeteer** (PDF generation — not yet built)
- **DocuSeal** (e-signature — not yet built)

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
- `provision_tenant()` SQL function for onboarding new tenants
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
- **Insert Field dropdown** — inserts `{{client.*}}` / `{{tenant.*}}` variable tokens as styled inline text (violet theme, shows live preview values from client/tenant data). Tokens: `company_name, contact_name, email, phone, address` for both client and tenant
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

#### PDF / Preview pipeline ✅ (renderer needs Railway deploy)
- **Serializer** (`lib/pdf/serialize.ts`) — pure function: BlockNote blocks → print-ready HTML. Handles token substitution (`{{client.*}}`/`{{tenant.*}}`), `pageBreak`→CSS `page-break-after`, `scenarioTable`→live pricing tables, inline styles, lists, images. Includes full `<style>` (Letter @page, scenario table styling)
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

## ⏸️ RESUME SNAPSHOT (last session end)
**Where things stand:**
- Code pushed to GitHub `spandya007/ultraquote` (branch `main`, latest commit `54405b7`).
- **PDF service is deployed on Railway** (Docker, `/pdf-service`) and `/health` returns ok. Auto-redeploys on push.
- AI writing, Duplicate Quote, optional pricing, scenario color-coding, scenario-delete guard, PDF header/footer (cover excluded, numbering from page 2), per-document header/footer toggle — all **built, tested, and working locally**.
- Web app **not yet deployed to Netlify** (see `DEPLOY.md`).

**Outstanding manual steps before/while deploying:**
1. Run migration `supabase/migrations/001_add_include_header_footer.sql` in Supabase SQL editor (required — saving a quote fails without the column). *(If already run locally, also fine.)*
2. Netlify env vars (full list in `DEPLOY.md`): Supabase ×3, `PDF_SERVICE_URL`, `PDF_SERVICE_TOKEN`, `GEMINI_API_KEY`.
3. Local `.env.local` already has Supabase + `GEMINI_API_KEY`; set `PDF_SERVICE_URL`/`PDF_SERVICE_TOKEN` locally if testing PDF download from laptop.

**Good next features to pick up:** Tenant logo (backlog #6, pairs with Settings page) · `.docx`/`.md` document import (backlog #5) · Templates · DocuSeal e-sign + Send flow · Dashboard stats.

## Next Up (not yet built)
- [x] ~~BlockNote document editor tab on quote (proposal narrative body)~~ ✅ DONE
- [x] ~~PDF generation + Preview~~ ✅ DONE (deployed to Railway; header/footer + per-document toggle)
- [ ] Templates — create/edit/import (`.docx` via Mammoth.js, `.md`)
- [ ] E-signature flow — DocuSeal integration (send for signature, webhook for completion)
- [ ] Settings page — tenant profile, logo, quote number prefix, tax rate, payment terms (note: `tenants.contact_name` column + Company Profile field already added)
- [ ] Quote "Send" flow — generate PDF → create DocuSeal submission → email signers
- [ ] Dashboard — meaningful stats (pipeline value, quotes by status, recent activity)

### Backlog / Reminders (user-requested — do not lose)
1. ~~**AI writing assistance in the Document**~~ ✅ DONE — **`gemini-2.5-flash`** via `POST /api/ai/write` (key server-side, `GEMINI_API_KEY`). NOTE: 2.5-flash is a thinking model — request sets `thinkingConfig.thinkingBudget: 0` so the token budget goes to output (otherwise it truncates). "Ask AI" toolbar dropdown in `proposal-editor.tsx`: selection actions (Improve/Make longer/Make shorter/Fix grammar/Change tone) + Generate-from-prompt + Continue writing. Context-aware (client/tenant/pricing grounding). **Preview-before-apply**: AI result is staged in a review modal (original strikethrough vs suggested) with Replace/Discard — the target range is captured up-front and applied via `insertContentAt({from,to})`. Toolbar also has **Undo/Redo** (TipTap history).
2. ~~**Duplicate a Quote**~~ ✅ DONE — `POST /api/quotes/[id]/duplicate` clones quote + scenarios + line items + document_content into a fresh draft (new quote number, title + " (Copy)"); "Duplicate" button per row in `quotes-client.tsx` → navigates to the copy.
5. ~~**Import/upload Document from `.docx` or `.md`**~~ ✅ DONE — "Import" button in `proposal-editor.tsx` toolbar. `.md`/`.txt` parsed client-side via `editor.tryParseMarkdownToBlocks`; `.docx` → `POST /api/documents/parse-docx` (mammoth → HTML) → **custom `lib/import/html-to-blocks.ts`** converter (BlockNote 0.14's `tryParseHTMLToBlocks` mangles `<table>` — empty shell + content dumped into `children`; our converter builds proper `tableContent` rows/cells, plus headings/lists/links/images). Serializer (`serialize.ts`) now renders `table` blocks (`.doc-table`). Fills an empty doc (replaceBlocks) or inserts at cursor. NOTES: merged cells (colspan/rowspan) not supported (flattened); mammoth embeds images as base64 data URIs → can bloat `document_content`. Reusable for Templates.
6. ~~**Tenant logo**~~ ✅ DONE — `tenants.logo_url` (column already existed). Upload UI in Settings → Company Profile (`settings-client.tsx`): uploads to `proposal-assets/tenant-logos/{tenantId}/...`, stores `sb-storage://` URL, signed-URL preview. Rendered on the PDF/Preview **first page** (`.doc-logo` above `doc-header` in `serialize.ts`); `load.ts` resolves the logo into the image map. NOT in the running header.
7. **Dark mode** — add a dark-mode toggle/setting in the UI. Tailwind is already CSS-variable themed (`app/globals.css` has `.dark` tokens); needs a theme toggle + persistence (e.g. `next-themes` or a `class` on `<html>`).
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
