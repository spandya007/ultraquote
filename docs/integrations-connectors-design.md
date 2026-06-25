# UltraQuote — Cloud Connectors Design (Distributors · Accounting · CRM)

> Research + design doc (2026-06-24). Builds on `docs/integrations-accounting-psa-research.md`
> (QBO + Autotask/PSA deep dive). Goal: a connector framework that lets an MSP Owner link UltraQuote
> to the cloud services they already use — to (a) **pull product data + cost into the catalog**,
> (b) **push approved quotes into accounting**, and (c) **sync clients/deals with their CRM**.
> No code yet; this is the technical groundwork + a recommended build order.

---

## 0. TL;DR — recommended priority (highest bang-for-buck first)

| # | Connector | Direction | Value | Effort | Why this rank |
|---|---|---|---|---|---|
| **1** | **QuickBooks Online** | Quote → Invoice (out) | ★★★★★ | ★★☆ | Headline "quote → invoice" ROI; self-contained OAuth; instant sandbox; broadest SMB adoption; half-researched already. |
| **2** | **HubSpot CRM** | Client/Deal ⇄ (both) | ★★★★☆ | ★★☆ | Huge CRM base; cleanest API; "lead → client + deal closed-won on sign" is compelling; simple OAuth. |
| **3** | **Ingram Micro** | Product + cost → catalog (in) | ★★★★☆ | ★★★★ | The real way to do your #1/#2 intent (name/desc/image/**reseller cost**). Big differentiator for hardware MSPs — but reseller-API onboarding friction. |
| **4** | **Pax8** | Cloud/SaaS SKUs + cost (in) | ★★★☆ | ★★★ | Dominant MSP cloud marketplace; OAuth; feeds recurring (MRR) line items. |
| **5** | **TD SYNNEX (StreamOne/Digital Bridge)** | Product + cost (in) | ★★★☆ | ★★★★ | Second distributor; cloud + hardware; sandbox available. |
| **6** | **Zoho CRM** | Client/Deal ⇄ (both) | ★★★☆ | ★★★ | Smaller than HubSpot but loyal; **we already use Zoho internally**; multi-data-center complexity. |
| **7** | **Public API + Webhooks + Zapier/Make** | Anything (both) | ★★★★☆ | ★★★ | Force-multiplier: one build → the long tail (thousands of apps) without bespoke connectors. Strongly consider early. |
| **—** | **Amazon Business** | — | ★☆ | n/a | **Does NOT fit the catalog-data use case** (see §3a). It's a *procurement/punchout* platform, not a reseller catalog-data API. Recommend dropping it from this initiative. |

**The honest reframe of your list:** the biggest, fastest wins are **outbound** (QBO invoicing) and **CRM**
(HubSpot) — not the inbound distributor catalog feeds you ranked #1/#2. Distributor APIs are valuable but
carry per-tenant onboarding friction (each MSP must have a reseller account + request API access), and
**Amazon Business can't supply catalog cost data at all** in a supported/compliant way. So I'd sequence
QBO + HubSpot first, then Ingram as the flagship catalog connector.

---

## 1. Two integration "shapes" (this drives the whole design)

Every connector is one of three flows. They have different "source of truth" rules:

1. **Inbound catalog enrichment** — pull *product* data (name, description, image, **your cost**, SKUs)
   from a **distributor** into `products`. Source of truth = the distributor. UltraQuote *caches* a
   snapshot; line items already snapshot price at add-time (sent quotes stay stable).
   → Ingram Micro, TD SYNNEX, Pax8, D&H. (NOT Amazon Business — §3a.)
2. **Outbound money/lifecycle** — push an *approved/signed quote* into **accounting** as a customer +
   estimate/invoice. Source of truth for money = the accounting system.
   → QuickBooks Online (Xero later for non-US).
3. **Bidirectional CRM** — keep *clients* in sync with the **CRM**, and on **signed** push the deal to
   closed-won (and/or create the deal when the quote is sent). Source of truth for the relationship = CRM.
   → HubSpot, Zoho CRM (Pipedrive later).

A PSA (Autotask/ConnectWise) is a *combination* of 1+2+3 and is covered in the separate PSA research doc
— heavier, for larger MSPs; not in this initiative's first phases.

---

## 2. Common architecture (build once, reuse for every connector)

### 2a. Connection registry
New table **`tenant_integrations`** (one row per tenant per provider):
- `tenant_id`, `provider` (`qbo|hubspot|zoho|ingram|tdsynnex|pax8|…`), `status` (`connected|error|disconnected`),
- `auth_type` (`oauth2|api_key`), `access_token`/`refresh_token`/`expires_at` (OAuth), or `api_key`/`api_secret` (key-based),
- `account_ref` (realmId / portalId / customer number / data-center), `scopes`, `settings` (JSONB: field-map, sync toggles), `connected_by`, timestamps.
- **RLS:** service-role only (tokens are secrets). **Encrypt** tokens at rest — Supabase **Vault** /
  pgsodium, or app-layer encryption with a KMS key. Never expose tokens to the browser.

### 2b. Multi-tenant OAuth (the key insight)
For OAuth providers (QBO, HubSpot, Zoho, Pax8) **UltraQuote registers ONE developer app** with each
vendor. Each Owner clicks **"Connect"** → vendor consent screen → we receive a per-tenant
**refresh token** we store (encrypted) and use to mint short-lived access tokens. The Owner never sees a
client secret. For **key-based** providers (Ingram, TD SYNNEX) the Owner pastes credentials they
generated in the distributor portal; we store them encrypted.

### 2c. External-ID mapping (idempotency)
`products` already has `quickbooks_online_id` + `autotask_id` + `supplier_sku`. Generalize to a
**`external_refs` JSONB** on `products`, `clients`, and `quotes` (e.g. `{"qbo":{"item_id":"42"},
"ingram":{"part":"…"}}`) — or per-entity link tables. This makes sync **idempotent** (find-or-create,
never duplicate) and supports multiple providers at once.

### 2d. Sync engine
- **Pull (catalog):** on-demand "Import from Ingram" + a scheduled refresh of linked products' cost/avail.
- **Push (QBO/CRM):** triggered by the existing lifecycle events — quote **sent** (create CRM deal),
  quote **signed** (DocuSeal webhook → already transitions to `completed`; hook here to create the QBO
  invoice + flip the CRM deal to won). Reuse the `completed` event as the single push trigger.
- **Webhooks in:** subscribe to provider webhooks (HubSpot, QBO, Zoho) so external edits flow back.
- **Reliability:** a `integration_sync_log` table (entity, provider, direction, status, error, payload
  digest) + retry/backoff. Surface failures in Settings → Integrations.

### 2e. The product **image** gap (you flagged this)
`products` has no image column. Add **`products.image_url`** (and reuse the `proposal-assets` Storage
bucket, or store the distributor's hosted image URL directly). Connectors populate it; the Product
drawer gets an image field + the client-facing tables/PDF can optionally show it. Small migration.

### 2f. Owner-facing surface
A new **Settings → Integrations** page: a card per provider with Connect/Disconnect, status, last-sync,
field-mapping + sync toggles. Owner-only (consistent with products/settings being owner-managed).

---

## 3. Per-vendor deep dive

### 3a. Amazon Business — reality check (recommend: DROP for catalog data)
**What it actually is:** a *purchasing* platform. Its integrations are **Punchout** (cXML/OCI) and
**Punch-in** — a procurement system "punches out" to Amazon, the buyer fills a cart, and the cart returns
to the procurement system for approval/PO. That's **buying**, not **quoting**.

**Why you can't pull "name/description/image/cost" into your catalog:**
- There is **no supported Amazon Business API** that exposes Amazon's catalog + *your negotiated business
  price* to a third-party app for re-use in quoting.
- The **Product Advertising API (PA-API 5.0)** returns catalog data (title, images, features, price) but
  (1) requires an approved **Amazon Associates** account, (2) requires **ongoing qualifying sales** to
  keep access, and (3) its **ToS restricts use to driving Amazon purchases via your affiliate links** —
  populating a reseller's quoting catalog would violate it. The "price" is **public retail**, not MSP cost.
- **Selling Partner API (SP-API)** is for *sellers* managing their own Amazon listings/orders — wrong tool.

**Recommendation:** exclude Amazon Business from the catalog-enrichment initiative. If a customer
genuinely wants Amazon as a *buying channel*, that's a procurement punchout project (different product,
out of scope for a quoting tool). For "what does this hardware cost me," the right sources are the
**distributor APIs** below, which return true reseller cost.

### 3b. Ingram Micro — the flagship catalog connector ✅
- **Portal:** `developer.ingrammicro.com` (xVantage / Reseller APIs). OpenAPI SDK on GitHub
  (`ingrammicro-xvantage/xi-sdk-openapispec`).
- **Endpoints we'd use:** **Search Products** (catalog browse/search), **Price & Availability (PNA)**
  (`POST /resellers/v6/catalog/priceandavailability`, up to 50 products: **reseller price**, discounts,
  stock, inventory location), product detail (description, attributes, **images**), plus order/quote/
  invoice APIs (later, for procurement).
- **Auth:** OAuth2 **client credentials** (client id/secret) + the reseller's **customer number**, issued
  to the reseller's Ingram account; tokens are short-lived (refresh as needed).
- **Fit:** exactly your #1/#2 intent for *hardware/software* — pull name, description, **image**, and
  **true reseller cost** into `products`. Snapshot at import; "Refresh prices from catalog" (already a
  pattern in UltraQuote) re-pulls cost/availability.
- **Owner setup:** must have an **Ingram Micro reseller account** → request API access on the developer
  portal (approval step) → receive **client id + secret + customer number** → paste into UltraQuote
  (or we do a client-credentials handshake). The approval gate is the main friction.

### 3c. TD SYNNEX (StreamOne Ion / Digital Bridge) ✅
- **APIs:** **StreamOne Ion API** (cloud/subscriptions; **Basic auth** = API Key as username, Secret as
  password) and the **Digital Bridge Developer Portal** (REST APIs for products, pricing, orders,
  renewals, cloud; **sandbox** available, Swagger docs).
- **Fit:** second distributor; strong on **cloud/subscription** SKUs + some hardware. Similar value to
  Ingram; build after Ingram to validate the catalog-connector abstraction generalizes.
- **Owner setup:** TD SYNNEX reseller account (ECexpress/StreamOne) → request API key/secret in
  Digital Bridge → paste into UltraQuote.

### 3d. Pax8 — cloud/SaaS marketplace ✅
- **Portal:** `devx.pax8.com` (Developer Platform). Create credentials in-portal: **Integrations → API
  credentials → Create** (client id/secret); **OAuth2 client-credentials** token flow. REST API for
  products/SKUs, pricing, subscriptions, orders; events/webhooks.
- **Fit:** Pax8 is *the* MSP cloud marketplace (Microsoft 365/NCE, security, backup SaaS). Mostly
  **recurring subscription** SKUs → feeds UltraQuote's **monthly-recurring** line items + MRR metrics.
  Less about hardware. High MSP adoption.
- **Owner setup:** Pax8 partner account → portal → Integrations → create API credential → connect (paste
  client id/secret, or OAuth). Low friction (self-serve in-portal).

### 3e. Others (brief)
- **D&H Distributing** — reseller APIs/EDI exist but less public/standardized; lower priority, add on demand.
- **Microsoft Partner Center (CSP/NCE)** — for MSPs who buy M365 direct; SKU + price APIs. A strong
  *future* candidate, parallel to Pax8. Needs its own research (CSP onboarding is heavy).
- **Synnex/Westcon/Climb** etc. — long tail; cover via the generic catalog-connector abstraction or
  CSV (the importer is already system-neutral).

### 3f. QuickBooks Online — #1 outbound ✅ (see also the existing QBO/PSA doc)
- **Auth:** Intuit **OAuth2** (we register one Intuit app); per-tenant **realmId** + refresh token
  (**rotates** — persist the newest). Sandbox company for dev.
- **Entities:** **Customer** (find-or-create from the quote's client), **Estimate** (on send/approve),
  **Invoice** (on signed), optional **Payment**; **Item** sync to map products. **Gotcha:** US **AST tax**
  is computed by QBO and may diverge from UltraQuote's `tax_rate` snapshot — decide who's authoritative.
- **Trigger:** the DocuSeal `completed` event → create the QBO invoice (idempotent via
  `quotes.external_refs.qbo.invoice_id`).
- **Owner setup:** click **"Connect to QuickBooks"** → Intuit consent (sign into their QBO company,
  authorize) → done. (Intuit's "Connect to QuickBooks" button is a standard, trusted UX.)

### 3g. HubSpot — #2, the CRM win ✅
- **Auth:** **OAuth2** public app (recommended; we register one app) — or a **Private App token** the
  Owner pastes (simplest for a single account, but per-account). Scopes:
  `crm.objects.contacts.read/write`, `crm.objects.companies.read/write`, `crm.objects.deals.read/write`.
- **Entities:** **Company/Contact** (= UltraQuote client), **Deal** (= the quote/opportunity).
  Flow: on quote **sent** → create/update a Deal (stage "proposal sent"); on **signed** → move Deal to
  **closed-won** + sync the amount. Inbound: HubSpot **webhooks** keep client contact info fresh
  ("lead → client" when a contact becomes a customer). Generous v3 REST API; clear rate limits.
- **Owner setup:** click **"Connect HubSpot"** → choose their HubSpot account → authorize scopes → done.
  (Or paste a Private App token from HubSpot Settings → Integrations → Private Apps.)

### 3h. Zoho CRM — #6 ✅ (we use Zoho internally)
- **Auth:** **OAuth2**; **multi-data-center** — the account lives in one of `.com / .eu / .in / .com.au /
  .jp` and **API + token URLs differ per DC** (must capture the DC at connect time). For multi-tenant we
  register a **server-based app** (per DC) and store per-tenant refresh tokens (a **Self Client** is only
  for a single org — not for our SaaS). Scopes per module, e.g. `ZohoCRM.modules.leads.ALL`,
  `…contacts.ALL`, `…deals.ALL`. v8 API.
- **Entities:** **Lead/Contact/Account** (= client), **Deal** (= quote). Same flow as HubSpot:
  send → create Deal; signed → closed-won; lead→contact conversion reflected back.
- **Owner setup:** click **"Connect Zoho"** → **pick data center** → Zoho consent → authorize → done.
- **Note:** the multi-DC handling is the extra complexity vs HubSpot — budget for it.

---

## 4. Force-multiplier: Public API + Webhooks + Zapier/Make
Rather than hand-build every connector, ship:
- **Outbound webhooks** (quote `sent`/`signed`/`declined`, client created) — already half-there with the
  DocuSeal webhook pattern.
- A **public REST API** with per-tenant API keys (already on the roadmap — see the pricing doc §11).
- A **Zapier / Make** app on top of those → MSPs self-serve the long tail (Pipedrive, Xero, Slack/Teams,
  Google Sheets, ConnectWise, thousands more) with **zero bespoke work** from us.

This is arguably a **top-3 ROI** item: one build unlocks the long tail and de-risks "do you integrate
with X?" sales objections. Strongly consider slotting it at #2–3.

---

## 5. Owner setup — quick reference (what each requires)

| Provider | Account the Owner needs | Where they get credentials | Connect UX in UltraQuote |
|---|---|---|---|
| QuickBooks Online | A QBO company (any paid edition) | Intuit OAuth consent | "Connect to QuickBooks" button |
| HubSpot | HubSpot account (free tier OK) | OAuth consent, or Private App token | "Connect HubSpot" (or paste token) |
| Zoho CRM | Zoho CRM account | OAuth consent (pick data center) | "Connect Zoho" + DC picker |
| Ingram Micro | **Ingram reseller account** | Developer portal → request API access (approval) → client id/secret + customer # | Paste credentials |
| TD SYNNEX | **TD SYNNEX reseller account** | Digital Bridge → API key + secret | Paste credentials |
| Pax8 | Pax8 partner account | Portal → Integrations → create API credential | Paste/OAuth |
| Amazon Business | n/a — not supported for catalog data (§3a) | — | — |

OAuth ones (QBO/HubSpot/Zoho/Pax8) = one-click consent, no secrets handled by the Owner. Distributor ones
require the Owner to already be a reseller and to generate API keys in that distributor's portal.

---

## 6. Build phases
- **Phase A — framework + QBO:** `tenant_integrations` table (encrypted tokens), Settings → Integrations
  page, OAuth plumbing, `external_refs` columns, sync log. Ship **QBO** (customer + invoice on signed).
- **Phase B — HubSpot:** reuse the OAuth framework; client⇄company/contact + deal on send/won; inbound webhook.
- **Phase C — Public API + webhooks + Zapier app:** unlock the long tail.
- **Phase D — Ingram catalog connector:** add `products.image_url`; catalog search + PNA import + refresh.
  Generalize into a "catalog provider" interface.
- **Phase E — Pax8 + TD SYNNEX:** prove the catalog-provider abstraction generalizes; cloud SKUs/MRR.
- **Phase F — Zoho CRM:** multi-DC OAuth.
- **Later:** Microsoft Partner Center, Xero, ConnectWise/Autotask PSA (see PSA doc), D&H.

## 7. Open questions / risks
- **Distributor API eligibility:** each requires the MSP to be an approved reseller + request API access
  (esp. Ingram). Friction on onboarding; some MSPs won't qualify → keep CSV import as the fallback.
- **Token security:** must encrypt at rest (Vault/pgsodium/KMS). Refresh-token rotation (QBO, Zoho).
- **Tax authority:** QBO computing tax vs UltraQuote's snapshot — pick one source, document it.
- **Cost ≠ list:** distributor APIs return *reseller cost*; UltraQuote's margin math already separates
  cost vs price — map distributor cost → `unit_cost`, leave `unit_price` to the MSP's markup rules.
- **Rate limits:** PNA caps (Ingram 50/req), CRM/QBO daily caps → batch + cache.
- **Pricing tie-in:** integrations are a natural **paid-tier / add-on** lever (see pricing doc); decide
  which tiers get which connectors.

---

## Appendix — sources (2026-06-24 research)
- Ingram Micro Developer Portal — developer.ingrammicro.com (Reseller APIs: catalog, PNA, order); xi-sdk-openapispec (GitHub).
- TD SYNNEX — StreamOne Ion API (tdsynnex.com/ion/api), Digital Bridge developer portal.
- Pax8 — devx.pax8.com (Developer Platform, API credentials, marketplace).
- Amazon Business — business.amazon.com (Punchout / systems integration); Product Advertising API 5.0 (webservices.amazon.com/paapi5) — affiliate-gated, ToS-restricted.
- HubSpot — developers.hubspot.com (OAuth scopes, CRM v3 contacts/companies/deals).
- Zoho CRM — zoho.com/crm/developer (v8 scopes, OAuth self-client vs server-based, multi-DC).
- Prior internal research: `docs/integrations-accounting-psa-research.md` (QBO + Autotask, competitive: Quoter/Kaseya/Zomentum).
