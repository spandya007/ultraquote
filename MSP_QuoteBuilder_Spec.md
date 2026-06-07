# MSP QuoteBuilder — Claude Code Kickoff Spec
**Version:** 1.0  
**Date:** June 2026  
**Author:** Sameer Pandya, CMIT Solutions of Hayward  

---

## 1. Project Overview

A **multi-tenant SaaS web application** for MSPs to create, manage, and send professional proposals with embedded pricing, margin tracking, and e-signatures. Built for internal use first (CMIT Solutions of Hayward), then offered to other MSPs as a paid SaaS product.

### Core Value Proposition
- AI-generated proposals (.docx/.md from Claude) imported into a block editor
- Inline pricing tables built from a product catalog (with cost/margin hidden from clients)
- Multiple pricing scenarios per quote (e.g. Scenario A vs. Scenario B)
- Multi-signer e-signature with configurable signing order
- PDF export of the complete document (narrative + pricing + signature)
- Mobile-ready (PWA first, React Native later)

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Already deployed on Netlify |
| Styling | Tailwind CSS | Mobile-first, responsive |
| State/Data | TanStack React Query | Offline cache support |
| Block Editor | BlockNote | Notion-like, TipTap-based, custom blocks |
| Auth | Supabase Auth (JWT) | Works for PWA + future React Native |
| Database | Supabase (Postgres) | Row-level security for multi-tenancy |
| File Storage | Supabase Storage | PDFs, .docx templates, logos |
| PDF Generation | Puppeteer (server-side) | HTML → PDF via headless Chrome |
| .docx import | Mammoth.js | .docx → HTML → BlockNote JSON |
| .md import | marked or remark | .md → HTML → BlockNote JSON |
| E-signature | DocuSeal (self-hosted) | Open source, sequential signing, REST API |
| Hosting | Netlify (frontend) + Railway (backend/Puppeteer) | Existing Netlify account |
| Payments (later) | Stripe | When charging other MSPs |

---

## 3. Data Model

> All tables include `tenant_id` for multi-tenancy.  
> Supabase Row Level Security (RLS) enforces tenant isolation on every table.  
> Use `uuid` as primary keys throughout.

---

### 3.1 `tenants`
```sql
id                    uuid PK default gen_random_uuid()
name                  text NOT NULL
logo_url              text
address               text
phone                 text
email                 text
created_at            timestamptz default now()
stripe_customer_id    text
```

---

### 3.2 `tenant_settings`
```sql
id                        uuid PK
tenant_id                 uuid FK → tenants.id
default_tax_rate          decimal(5,4)       -- e.g. 0.1025
default_valid_days        int default 30
quote_number_prefix       text default 'QUOTE'
quote_number_sequence     int default 1      -- auto-increment on each new quote
default_payment_terms     text default 'Net 30'
signature_provider        text default 'docuseal'
```

---

### 3.3 `users`
```sql
id            uuid PK  -- matches Supabase Auth user id
tenant_id     uuid FK → tenants.id
email         text NOT NULL
full_name     text
role          text default 'member'   -- owner | member
created_at    timestamptz default now()
```

---

### 3.4 `clients`
```sql
id              uuid PK
tenant_id       uuid FK → tenants.id
company_name    text NOT NULL
contact_name    text
contact_email   text
contact_phone   text
address         text
notes           text
is_active       boolean default true
created_at      timestamptz default now()
```

---

### 3.5 `product_categories`
```sql
id            uuid PK
tenant_id     uuid FK → tenants.id
name          text NOT NULL     -- Managed Services | Hardware | Security | Cloud | Professional Services | Software
sort_order    int default 0
```

**Seed data on tenant creation:**
- Managed Services
- Hardware
- Software
- Security
- Cloud
- Professional Services

---

### 3.6 `products`
```sql
id                      uuid PK
tenant_id               uuid FK → tenants.id
zomentum_id             text              -- preserved from Zomentum import
category_id             uuid FK → product_categories.id
name                    text NOT NULL
description             text
item_type               text              -- Service | Hardware | Software | Other
billing_period          text              -- Monthly | One Time
unit                    text              -- each | /user/month | /device/month | hour
unit_cost               decimal(10,2)     -- internal cost, never shown to client
unit_price              decimal(10,2)     -- default sell price
setup_price             decimal(10,2) default 0
is_taxable              boolean default false
is_price_overrideable   boolean default false   -- true for $0 placeholder items
is_active               boolean default true
manufacturer            text
manufacturer_part_no    text
supplier_name           text
supplier_sku            text
autotask_id             text
quickbooks_online_id    text
created_at              timestamptz default now()
```

---

### 3.7 `product_pricing_tiers`
```sql
id              uuid PK
product_id      uuid FK → products.id
tier_name       text NOT NULL     -- Default | Plus | Ultra | Hot Standby | Core Services
description     text
unit_cost       decimal(10,2)
unit_price      decimal(10,2)
is_default      boolean default false
sort_order      int default 0
```

---

### 3.8 `templates`
```sql
id                  uuid PK
tenant_id           uuid FK → tenants.id
name                text NOT NULL
description         text
document_content    jsonb         -- BlockNote JSON
tags                text[]        -- e.g. ['onboarding', 'relocation', 'security']
source_file_type    text          -- docx | md | native (built in editor)
is_active           boolean default true
created_at          timestamptz default now()
```

**Template variables** (substituted on new quote creation):
- `{{client_name}}` — client company name
- `{{contact_name}}` — client contact
- `{{prepared_by}}` — MSP owner name
- `{{quote_number}}` — e.g. CMIT-2026-001
- `{{valid_through}}` — computed from default_valid_days
- `{{prepared_date}}` — today's date
- `{{msp_name}}` — tenant name
- `{{msp_address}}` — tenant address
- `{{msp_phone}}` — tenant phone

---

### 3.9 `quotes`
```sql
id                      uuid PK
tenant_id               uuid FK → tenants.id
client_id               uuid FK → clients.id
template_id             uuid FK → templates.id (nullable)
quote_number            text NOT NULL UNIQUE   -- e.g. CMIT-2026-001
title                   text
status                  text default 'draft'
  -- draft | sent | viewed | signed | declined | expired
document_content        jsonb         -- BlockNote JSON (the full proposal document)
valid_until             date
notes                   text
show_margins            boolean default false   -- internal toggle only
tax_rate                decimal(5,4)            -- snapshot from tenant_settings
payment_terms           text
selected_scenario_id    uuid (nullable)         -- set when client accepts
pdf_url                 text
created_at              timestamptz default now()
updated_at              timestamptz default now()
sent_at                 timestamptz
signed_at               timestamptz
```

**Quote number generation** (on INSERT trigger):
```sql
-- pseudo-code
prefix = tenant_settings.quote_number_prefix       -- e.g. "CMIT"
year   = EXTRACT(YEAR FROM now())                   -- e.g. 2026
seq    = tenant_settings.quote_number_sequence      -- e.g. 001
quote_number = prefix || '-' || year || '-' || LPAD(seq::text, 3, '0')
-- then increment tenant_settings.quote_number_sequence
```

---

### 3.10 `quote_scenarios`
```sql
id                      uuid PK
quote_id                uuid FK → quotes.id
name                    text NOT NULL    -- e.g. "Scenario A — Shared ISP"
description             text
is_recommended          boolean default false
sort_order              int default 0
monthly_recurring_total decimal(10,2) default 0   -- sum of Monthly line items
onetime_total           decimal(10,2) default 0   -- sum of One Time line items
tax_amount              decimal(10,2) default 0
total                   decimal(10,2) default 0
```

---

### 3.11 `quote_line_items`
```sql
id                  uuid PK
scenario_id         uuid FK → quote_scenarios.id
product_id          uuid FK → products.id (nullable — allows free-text items)
pricing_tier_id     uuid FK → product_pricing_tiers.id (nullable)
description         text NOT NULL     -- overrideable at quote time
billing_period      text              -- snapshot: Monthly | One Time
quantity            decimal(10,3) default 1
unit_cost           decimal(10,2)     -- snapshot (never shown to client)
unit_price          decimal(10,2)     -- snapshot
setup_price         decimal(10,2) default 0
is_taxable          boolean default false
margin_percent      decimal(5,2)      -- computed: ((price-cost)/price)*100
line_total          decimal(10,2)     -- computed: qty * unit_price
sort_order          int default 0
```

---

### 3.12 `quote_signers`
```sql
id                    uuid PK
quote_id              uuid FK → quotes.id
signer_name           text NOT NULL
signer_email          text NOT NULL
role                  text         -- Client | Authorized Signatory | MSP Owner
signing_order         int          -- 1, 2, 3... sequential
status                text default 'pending'
  -- pending | sent | viewed | signed | declined
provider_signer_id    text         -- DocuSeal internal reference
sent_at               timestamptz
signed_at             timestamptz
```

---

### 3.13 `quote_signature_sessions`
```sql
id                      uuid PK
quote_id                uuid FK → quotes.id
provider                text default 'docuseal'
provider_document_id    text
status                  text default 'pending'
  -- pending | completed | declined
signed_document_url     text
created_at              timestamptz default now()
completed_at            timestamptz
```

---

### 3.14 Entity Relationship Summary
```
tenants
  ├── tenant_settings
  ├── users
  ├── clients
  ├── product_categories
  │     └── products
  │           └── product_pricing_tiers
  ├── templates                          (document_content: BlockNote JSON)
  └── quotes                             (document_content: BlockNote JSON)
        ├── quote_scenarios
        │     └── quote_line_items ──→ products + product_pricing_tiers
        ├── quote_signers
        └── quote_signature_sessions
```

---

## 4. API Routes

Base path: `/app/api/` (Next.js App Router route handlers)  
All routes require authenticated session via Supabase Auth middleware except `/api/quotes/:id/sign` (public).

---

### Auth
```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
```

### Tenant
```
GET    /api/tenant
PUT    /api/tenant
GET    /api/tenant/settings
PUT    /api/tenant/settings
```

### Clients
```
GET    /api/clients                   -- list with search/filter
POST   /api/clients
GET    /api/clients/:id
PUT    /api/clients/:id
DELETE /api/clients/:id               -- soft delete (is_active = false)
```

### Product Categories
```
GET    /api/product-categories
POST   /api/product-categories
PUT    /api/product-categories/:id
DELETE /api/product-categories/:id
```

### Products
```
GET    /api/products                  -- list, filter by category/type/billing
POST   /api/products
GET    /api/products/:id
PUT    /api/products/:id
DELETE /api/products/:id              -- soft delete
POST   /api/products/import           -- bulk CSV import (from Zomentum export)

GET    /api/products/:id/tiers
POST   /api/products/:id/tiers
PUT    /api/products/:id/tiers/:tierId
DELETE /api/products/:id/tiers/:tierId
```

### Templates
```
GET    /api/templates
POST   /api/templates                 -- create native template
GET    /api/templates/:id
PUT    /api/templates/:id
DELETE /api/templates/:id
POST   /api/templates/import          -- upload .docx or .md → convert to BlockNote JSON
```

### Quotes
```
GET    /api/quotes                    -- list, filter by status/client/date
POST   /api/quotes                    -- create + auto-generate quote_number
GET    /api/quotes/:id                -- full quote with scenarios, line items, signers
PUT    /api/quotes/:id
DELETE /api/quotes/:id                -- soft delete
POST   /api/quotes/:id/duplicate      -- clone as new draft
POST   /api/quotes/import             -- upload .docx or .md → new quote

-- Scenarios
POST   /api/quotes/:id/scenarios
PUT    /api/quotes/:id/scenarios/:scenarioId
DELETE /api/quotes/:id/scenarios/:scenarioId
POST   /api/quotes/:id/scenarios/:scenarioId/duplicate

-- Line Items
POST   /api/quotes/:id/scenarios/:scenarioId/line-items
PUT    /api/quotes/:id/scenarios/:scenarioId/line-items/:itemId
DELETE /api/quotes/:id/scenarios/:scenarioId/line-items/:itemId
POST   /api/quotes/:id/scenarios/:scenarioId/line-items/reorder

-- Actions
POST   /api/quotes/:id/send           -- status → sent, trigger e-sign
POST   /api/quotes/:id/accept         -- set selected_scenario_id, status → signed
POST   /api/quotes/:id/decline
POST   /api/quotes/:id/expire

-- PDF
GET    /api/quotes/:id/pdf            -- generate or return cached PDF
POST   /api/quotes/:id/pdf/regenerate

-- Signers
GET    /api/quotes/:id/signers
POST   /api/quotes/:id/signers
PUT    /api/quotes/:id/signers/:signerId
DELETE /api/quotes/:id/signers/:signerId
POST   /api/quotes/:id/signers/reorder

-- E-Signature
POST   /api/quotes/:id/signature/send
GET    /api/quotes/:id/signature/status
POST   /api/quotes/:id/signature/webhook   -- DocuSeal callback (public endpoint)
GET    /api/quotes/:id/signature/download
```

### Dashboard
```
GET    /api/dashboard/summary         -- quote counts by status, MRR pipeline
GET    /api/dashboard/mrr             -- monthly recurring revenue in pipeline
```

---

## 5. Document Import Pipeline

### .md → BlockNote JSON
```
.md file
  → marked (parse to HTML)
  → BlockNote HTML importer
  → document_content (jsonb)
```

### .docx → BlockNote JSON
```
.docx file
  → Mammoth.js (convert to clean HTML)
    - preserves: headings, paragraphs, bold/italic, lists, basic tables
    - strips: Word styles, fonts, images (v1), page breaks
  → BlockNote HTML importer
  → document_content (jsonb)
```

### API route
```
POST /api/quotes/import
POST /api/templates/import

-- multipart/form-data
-- field: file (.docx or .md)
-- field: client_id (for quotes)
-- field: title

-- Response: { id, quote_number, redirect_url }
```

---

## 6. Block Editor — Custom Block Types

Built with **BlockNote** on top of TipTap.

### Standard blocks (built-in, no custom work needed)
- Paragraph, Heading 1/2/3, Bullet List, Numbered List, Divider, Image

### Custom blocks (build these)

**`PricingTableBlock`**
- Renders inline in the document
- Shows scenario tabs (Scenario A / Scenario B / + Add)
- Each scenario shows line items: Description | Qty | Price | [Cost] | [Margin%]
- Cost and Margin columns visible only when `show_margins = true` (never in client PDF)
- Footer rows: Monthly Recurring | One-Time | Tax | Total
- Clicking the block opens a side panel product picker

**`SignatureBlock`**
- Renders at document end
- Displays signer name, role, signature box, date field per signer
- Pulls from `quote_signers` table
- Clicking opens signer management panel (add/remove/reorder signers)

**`CoverBlock`** (optional v1)
- Renders title, client info, prepared-by, valid-through, logos
- Auto-populated from quote metadata + template variables

---

## 7. PDF Generation

```
GET /api/quotes/:id/pdf

Server flow:
1. Fetch quote with all relations
2. Render BlockNote JSON → HTML (server-side React render)
3. Inject CSS (Tailwind + custom PDF styles)
4. Replace {{variables}} with actual values
5. Puppeteer: launch headless Chrome, load HTML, print to PDF
6. Upload PDF to Supabase Storage
7. Save url to quotes.pdf_url
8. Return signed URL to client

PDF layout:
- CMIT logo top-right on every page
- Footer: tenant name | confidential | page N of M
- Pricing table: clean tabular layout, Cost/Margin columns stripped
- Signature page: signature boxes, client logo + MSP logo side by side
```

---

## 8. UI Screens

### Auth
- `/login` — email + password via Supabase Auth

### Dashboard
- `/` — pipeline summary (draft/sent/viewed/signed counts), MRR in pipeline, recent quotes

### Clients
- `/clients` — searchable list
- `/clients/new`
- `/clients/:id` — profile + quote history

### Products
- `/products` — catalog, filterable by category/type/billing period
- `/products/new`
- `/products/:id/edit`
- `/products/import` — CSV upload with column mapping UI (maps Zomentum columns)

### Templates
- `/templates` — list
- `/templates/new` — blank editor
- `/templates/import` — upload .docx or .md
- `/templates/:id/edit` — block editor

### Quotes
- `/quotes` — list with status tabs: All | Draft | Sent | Viewed | Signed | Expired
- `/quotes/new` — 3-step wizard:
  - Step 1: Select client
  - Step 2: Choose start method (Template | Import .docx/.md | Blank)
  - Step 3: Set title, valid-until, tax rate → opens editor
- `/quotes/:id/edit` — **main document editor** (see Section 9)
- `/quotes/:id/preview` — read-only client view (margins hidden)
- `/quotes/:id/sign` — **public page** (no auth), client signs here

### Settings
- `/settings/tenant` — logo, name, address, phone
- `/settings/preferences` — default tax rate, valid days, quote prefix, payment terms
- `/settings/integrations` — DocuSeal URL + API key, QBO sync (later)
- `/settings/billing` — Stripe (Phase 3)

---

## 9. Quote Editor Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Quotes  |  CMIT-2026-001  ·  Conex Modular  |  [Draft ▾]  [Send ▶] │
├───────────┬─────────────────────────────────────────────────────┤
│           │                                                     │
│ OUTLINE   │   Block editor (BlockNote)                          │
│ ────────  │   Full-width, paginated feel                        │
│ Cover     │                                                     │
│ Exec Sum  │   Type '/' to insert a block                        │
│ Situation │                                                     │
│ Solution  │   [ All narrative sections render here ]            │
│ Pricing ← │──→ [ /pricingTable block renders inline ]           │
│ Signature │   [ /signatureBlock renders inline ]                │
│           │                                                     │
│ ────────  │                                                     │
│ [👁 PDF]  │                                                     │
│ [💰 Margins toggle]                                             │
│ [📤 Send] │                                                     │
└───────────┴─────────────────────────────────────────────────────┘
```

**Right side panel** (slides in when editing PricingTableBlock):
```
┌─────────────────────────────┐
│ Scenarios                   │
│ [Scenario A ✓] [+ Add]      │
│ ─────────────────────────── │
│ + Add Product               │
│ [Search catalog...]         │
│                             │
│ Core Services Package       │
│  Tier: [Plus ▾]  Qty: [6]  │
│  $55.01/mo  → $330.06/mo   │
│  Cost: $2.25 · Margin: 96% │
│                             │
│ ─────────────────────────── │
│ Monthly Recurring: $330/mo  │
│ One-Time:          $500.00  │
│ Tax (10.25%):       $33.83  │
│ ─────────────────────────── │
│ TOTAL MONTHLY:     $363/mo  │
└─────────────────────────────┘
```

---

## 10. Multi-Tenancy Implementation

Use Supabase Row Level Security (RLS) on every table:

```sql
-- Example RLS policy (apply to all tables with tenant_id)
CREATE POLICY "tenant_isolation" ON products
  USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

Store `tenant_id` in the Supabase Auth JWT via a custom claim set on login.

**This is the most important architectural decision — implement RLS from day one.**  
Cost to add upfront: ~2 hours. Cost to retrofit later: weeks.

---

## 11. Mobile Strategy

**Phase 1-2: Progressive Web App (PWA)**
- Add `next-pwa` to Next.js config
- Manifest + service worker for home screen install
- All screens designed mobile-first with Tailwind responsive classes
- Quote editor usable on iPad for on-site client meetings

**Phase 3+: React Native with Expo**
- API-first architecture means zero backend changes
- High React logic reuse between web and native
- Supabase Auth JWT works identically in React Native
- Priority screens for native: Quote viewer, Client list, Dashboard

---

## 12. Phase Plan

### Phase 1 — Internal Tool (Weeks 1–6)
**Goal:** Replace Zomentum for CMIT Solutions of Hayward

- [ ] Project scaffold (Next.js + Supabase + Tailwind)
- [ ] Supabase schema + RLS policies
- [ ] Auth (login/logout/me)
- [ ] Tenant + settings setup
- [ ] Product catalog (CRUD + CSV import from Zomentum export)
- [ ] Product pricing tiers
- [ ] Clients (CRUD)
- [ ] Quote creation wizard
- [ ] Block editor (BlockNote) with PricingTableBlock + SignatureBlock
- [ ] .md import pipeline
- [ ] .docx import pipeline (Mammoth.js)
- [ ] Quote scenarios + line items
- [ ] Margin toggle
- [ ] PDF generation (Puppeteer)
- [ ] DocuSeal e-signature integration
- [ ] Multi-signer with ordering
- [ ] Quote status tracking
- [ ] Basic dashboard

### Phase 2 — Multi-Tenant Hardening (Weeks 7–12)
**Goal:** Ready to show other MSPs

- [ ] Per-tenant branding (logo, colors, quote prefix)
- [ ] Template library (import + native editor)
- [ ] Quote duplication + versioning
- [ ] PWA (next-pwa, offline quote viewing)
- [ ] Dashboard MRR analytics
- [ ] QBO sync (products + invoices)
- [ ] Email notifications (quote sent/viewed/signed)
- [ ] Onboarding flow for new tenants

### Phase 3 — SaaS Launch
- [ ] Stripe billing
- [ ] Pricing tiers (Free/Starter/Pro)
- [ ] Landing page
- [ ] Public signup
- [ ] React Native app (Expo)

---

## 13. Starting Prompt for Claude Code

Copy and paste the following as your **first message** when you open Claude Code:

---

```
I'm building a multi-tenant SaaS web application called "MSP QuoteBuilder" 
for Managed Service Providers to create, manage, and send professional proposals.

I have a complete spec document that defines the full data model, API routes, 
UI screens, and tech stack. I'll paste the relevant sections as we build each part.

TECH STACK:
- Next.js 14 (App Router)
- Supabase (Postgres + Auth + Storage + RLS)
- Tailwind CSS
- TanStack React Query
- BlockNote (block editor)
- Puppeteer (PDF generation, runs on Railway)
- Mammoth.js (.docx import)
- DocuSeal (e-signature, self-hosted)

FIRST TASK:
Scaffold the Next.js 14 project with the following structure:

/app
  /api         ← API route handlers
  /(auth)
    /login
  /(dashboard)
    /page.tsx          ← dashboard home
    /quotes/...
    /clients/...
    /products/...
    /templates/...
    /settings/...
  /layout.tsx
/components
  /ui            ← shadcn/ui components
  /editor        ← BlockNote custom blocks
  /quotes        ← quote-specific components
  /products      ← product catalog components
/lib
  /supabase      ← client + server + middleware
  /pdf           ← Puppeteer PDF generation
  /import        ← .docx and .md import pipelines
  /utils
/types
  index.ts       ← all TypeScript interfaces matching the DB schema

Please:
1. Initialize the Next.js 14 project with TypeScript, Tailwind, and App Router
2. Install and configure Supabase client (both browser and server)
3. Set up Supabase Auth middleware for route protection
4. Create the full TypeScript type definitions for all database tables
5. Create the Supabase schema SQL file with all tables and RLS policies

Here are the TypeScript types to create (matching the database schema exactly):
[PASTE SECTION 3 OF THE SPEC HERE]
```

---

## 14. Step-by-Step Claude Code Session Guide

### Session 1 — Project Scaffold + Schema
1. Open Claude Code in your terminal: `claude`
2. Paste the Starting Prompt above (Section 13)
3. Paste Section 3 (Data Model) when prompted
4. Let Claude Code scaffold the project and generate the Supabase SQL
5. Run the SQL in your Supabase project dashboard → SQL Editor
6. Verify all tables exist in Supabase → Table Editor

### Session 2 — Auth + Tenant Setup
Prompt: *"Implement Supabase Auth with login/logout. On first login, if no tenant exists for this user, redirect to a tenant setup wizard (name, logo, address). Store tenant_id as a custom claim in the JWT."*

### Session 3 — Product Catalog
Prompt: *"Build the product catalog: CRUD API routes for /api/products and /api/products/:id/tiers, the /products page with search/filter, and a CSV import route at /api/products/import that maps Zomentum export columns to our schema."*  
→ Upload your `Product-export.csv` to Claude Code for reference.

### Session 4 — Quote Creation + Block Editor
Prompt: *"Build the quote creation wizard (3 steps: client → start method → metadata) and integrate BlockNote as the document editor. Implement the custom PricingTableBlock that renders scenarios and line items inline, with a slide-in product picker panel."*

### Session 5 — Document Import
Prompt: *"Implement the document import pipeline. POST /api/quotes/import and POST /api/templates/import should accept .docx (via Mammoth.js) and .md (via marked) files, convert to BlockNote JSON, and save to document_content. Show an import success banner in the editor."*

### Session 6 — PDF Generation
Prompt: *"Implement PDF generation using Puppeteer. GET /api/quotes/:id/pdf should render the BlockNote document_content to HTML server-side, inject print CSS, strip Cost/Margin columns, run Puppeteer to generate a PDF, upload to Supabase Storage, and return a signed URL."*

### Session 7 — E-Signature (DocuSeal)
Prompt: *"Integrate DocuSeal for e-signatures. POST /api/quotes/:id/signature/send should submit the generated PDF to DocuSeal with signers in order from quote_signers. Implement the webhook handler at /api/quotes/:id/signature/webhook to update signer statuses. Build the public /quotes/:id/sign page that shows the DocuSeal signing UI."*

### Session 8 — Dashboard + Polish
Prompt: *"Build the dashboard at / showing quote pipeline counts by status, MRR in pipeline (sum of monthly_recurring_total for sent/viewed quotes), and a recent quotes list. Add the margin toggle to the quote editor. Add PWA support via next-pwa."*

---

## 15. Environment Variables Needed

Create `.env.local` in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# DocuSeal (self-hosted)
DOCUSEAL_BASE_URL=https://your-docuseal-instance.com
DOCUSEAL_API_KEY=your-docuseal-api-key

# App
NEXT_PUBLIC_APP_URL=https://your-app-url.com
```

---

## 16. Key Reference Files to Have Ready in Claude Code

- `Product-export.csv` — your Zomentum product catalog for import testing
- `Conex_Modular_MSP_Proposal.pdf` — reference for PDF output quality target
- This spec file (`MSP_QuoteBuilder_Spec.md`) — paste relevant sections per session

---

*End of Spec — MSP QuoteBuilder v1.0*
