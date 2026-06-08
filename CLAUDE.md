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

#### PDF / Preview pipeline ✅ (renderer needs Railway deploy)
- **Serializer** (`lib/pdf/serialize.ts`) — pure function: BlockNote blocks → print-ready HTML. Handles token substitution (`{{client.*}}`/`{{tenant.*}}`), `pageBreak`→CSS `page-break-after`, `scenarioTable`→live pricing tables, inline styles, lists, images. Includes full `<style>` (Letter @page, scenario table styling)
- **Image resolution** (`lib/pdf/resolve-images.ts`) — pre-resolves `sb-storage://` URLs → signed URLs into a map so the serializer stays sync
- **Data loader** (`lib/pdf/load.ts`) — fetches quote+scenarios+line_items+client+tenant+image map → `SerializeInput`
- **Inline Scenario block** — custom `scenarioTable` block (`proposal-editor.tsx`), insertable via slash menu (`/pricing`). Stores a *reference* (`scenarioRef`: `recommended`|`all`|specific id), NOT a snapshot, so tables stay live. In-editor live preview fed by `ScenarioContext` (provides current scenarios+taxRate, since BlockNote block renders can't take parent props)
- **Pricing is OPTIONAL** — serializer renders pricing only where the author placed a `scenarioTable` block (no auto-append). On Preview, if the live document has no pricing table, `quote-editor` shows a `toast.warning` but proceeds. `ProposalEditor` exposes `onReady({ saveNow, hasPricingTable })` for this check + the pre-preview save flush
- **Preview** — "Preview" button in quote editor header opens a full-screen modal with an `<iframe>` pointing at the preview route; flushes document + metadata saves first so preview is current. "Download PDF" button links to the pdf route. NOTE: running header/footer are print-only (Puppeteer) so they do NOT appear in the on-screen iframe Preview
- **Running header/footer** (`buildHeaderTemplate`/`buildFooterTemplate` in `serialize.ts`) — header: tenant name (left) + quote number (right); footer: "Confidential — prepared for {client}" (left) + "Page X of Y" (right). Rendered by Puppeteer into the page margin. **Suppressed on page 1** via `@page :first { margin-top/bottom: 0 }` (no margin box → not drawn); page-1 keeps its in-body `doc-header` title block (future home of the tenant logo). The pdf route passes `headerHtml`/`footerHtml` to the service; service uses `displayHeaderFooter` + `preferCSSPageSize`
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

## Next Up (not yet built)
- [x] ~~BlockNote document editor tab on quote (proposal narrative body)~~ ✅ DONE
- [x] ~~PDF generation + Preview~~ ✅ DONE (code complete; **pending: deploy `/pdf-service` to Railway + set env vars**)
- [ ] Templates — create/edit/import (`.docx` via Mammoth.js, `.md`)
- [ ] E-signature flow — DocuSeal integration (send for signature, webhook for completion)
- [ ] Settings page — tenant profile, logo, quote number prefix, tax rate, payment terms (note: `tenants.contact_name` column + Company Profile field already added)
- [ ] Quote "Send" flow — generate PDF → create DocuSeal submission → email signers
- [ ] Dashboard — meaningful stats (pipeline value, quotes by status, recent activity)

### Backlog / Reminders (user-requested — do not lose)
1. **AI writing assistance in the Document** — integrate Google Gemini **Flash** APIs to help author/refine the proposal narrative in the BlockNote editor (e.g. generate/expand/rewrite sections).
2. ~~**Duplicate a Quote**~~ ✅ DONE — `POST /api/quotes/[id]/duplicate` clones quote + scenarios + line items + document_content into a fresh draft (new quote number, title + " (Copy)"); "Duplicate" button per row in `quotes-client.tsx` → navigates to the copy.
5. **Import/upload Document from `.docx` or `.md`** — let users populate the Document editor by uploading a Word or Markdown file (parse → BlockNote blocks). `mammoth` is already a dependency for `.docx`. Also relevant to the Templates feature.
6. **Tenant logo** — add a `logo_url` column on `tenants` + upload UI in Settings. User wants the logo on the **first page** of the PDF (NOT in the running header). First-page title block (`doc-header` in `lib/pdf/serialize.ts`) is where it should render once available.
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
