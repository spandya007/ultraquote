# Accounting & PSA Integrations — Research (QuickBooks Online + Autotask)

> Research-only document (2026-06-12). No code written. Goal: understand how UltraQuote could
> sync **products** out of quotes and push **estimates/invoices** into QuickBooks Online (QBO) and
> Datto Autotask PSA, benchmarked against Quoter (ScalePad), Kaseya Quote Manager, and Zomentum.
> Decisions deferred — this is the technical groundwork for a later build.

---

## 1. Why this matters / the MSP workflow

In an MSP's real stack the quoting tool is rarely the system of record for money. Two patterns dominate:

- **Quote → Accounting (QBO):** the quote tool creates a *customer*, an *estimate*, and on
  acceptance an *invoice* + payment in QuickBooks. Good for small MSPs whose books live in QBO.
- **Quote → PSA (Autotask) → Accounting:** the quote tool syncs to an Autotask *opportunity*;
  on win it creates a sales order / contract / charges in Autotask, and **Autotask** (not the quote
  tool) does the invoicing, optionally forwarding invoices to QBO. Good for larger MSPs where the
  PSA is the single source of truth for clients, contracts, and billing.

UltraQuote should support **both** patterns, but they are different integrations with different
"source of truth" rules. The key design question for each entity (Product, Client, Quote, Invoice)
is: **which system owns it, and which direction does data flow?**

---

## 2. Competitive comparison (what the incumbents actually do)

### Quoter (ScalePad) — the closest direct competitor

**Quoter + QuickBooks Online**
- **Customer sync:** search existing QBO customers when building a quote, or create a new QBO
  customer from Quoter ("Customer/Person Search Sync").
- **Estimate creation:** publishing a Quoter quote creates a matching **QBO Estimate** with line items.
- **Invoice creation:** when "Create QuickBooks Invoices" is enabled, moving a quote to
  *Accepted / Ordered / Fulfilled* auto-creates a **QBO Invoice**.
- **Payment:** a payment accepted in Quoter posts a **Transaction against the QBO invoice**.
- **Limitation:** QBO editions only — **no QuickBooks Desktop / Hosted**.

**Quoter + Datto Autotask PSA**
- **Products/services:** Autotask is the "single source of truth"; quotes are built from items
  stored in Autotask (pull pricing into the quote).
- **Customers/opportunities:** search an existing Autotask **Contact + Opportunity** or create them.
- **Bidirectional push/pull** when building and publishing quotes.
- **Status mapping:** Quote *won/lost* updates the Autotask **Opportunity** status per a mapping.
- Uses Autotask **LiveLinks** + **ExecuteCommand API** for deep links / advanced actions.
- Setup: requires "organization" as a required field in Quoter + an Autotask API user.

### Kaseya Quote Manager (+ Autotask / BMS)
- Quote syncs to an **Autotask Opportunity**; on sale, Quote Manager creates a **sales order** that
  syncs to a **ticket** in Autotask. **Autotask does the invoicing**; Quote Manager handles
  automated **purchasing/procurement** (distributor catalogs, real-time pricing/stock).
- Strong on procurement (Ingram, D&H, etc.) — a different center of gravity than UltraQuote.

### Zomentum
- Bi-directional sync with Autotask (and ConnectWise) for accounts, products, opportunities; pushes
  won quotes back as opportunities/orders. Also integrates QuickBooks for invoicing. Note: our seed
  product catalog was originally a **Zomentum CSV export** (see CSV importer), so field shapes are
  already familiar.

### Takeaways for UltraQuote
1. **Estimate-on-publish + Invoice-on-accept + Payment-posting** is the table-stakes QBO feature set.
   We already have the quote lifecycle (`sent/viewed/signed`) and DocuSeal signing — `signed` is the
   natural trigger for "create invoice."
2. For Autotask, the expected model is **PSA = source of truth for products + clients**, quote tool
   pushes an **opportunity** and updates its status on win. We currently own the catalog locally, so
   we'd need a sync/import strategy and a "linked Autotask product ID" on our products.
3. Everyone uses a **mapping/config UI** (field mapping, status mapping, which account/tax code).
   This is per-tenant configuration, not hardcoded.
4. Nobody supports QuickBooks Desktop — QBO only is an acceptable scope.

---

## 3. QuickBooks Online API — technical notes

**Auth:** OAuth 2.0 **only** (no API keys). Authorization-Code flow:
1. Redirect to `https://appcenter.intuit.com/connect/oauth2` with Client ID + scopes.
2. Intuit returns an auth `code` + `realmId` (the company id — store it per tenant).
3. Exchange at `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` for access + refresh tokens.

- **Access token:** expires in **1 hour**.
- **Refresh token:** rotates every ~24h, **5-year** max lifetime. **You must persist the newest
  refresh token after every refresh** or the whole authorization chain is revoked. (Critical for a
  multi-tenant app — store per-tenant tokens encrypted; refresh proactively.)
- **Scopes:** `com.intuit.quickbooks.accounting` (invoices/items/customers),
  `com.intuit.quickbooks.payment` (card processing).

**Base URLs** (note the per-company `realmId` path + mandatory `minorversion`):
- Production: `https://quickbooks.api.intuit.com/v3/company/{realmId}/`
- Sandbox: `https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}/`
- Append `?minorversion=75` to every request (v3 is the only major version; 1–74 deprecated).

**Entity mapping (UltraQuote → QBO):**

| UltraQuote concept | QBO entity | Notes |
|---|---|---|
| Client (`clients`) | `Customer` | search-or-create; store `qbo_customer_id` on our client |
| Catalog product (`products`) | `Item` (Service/Inventory) | needs `IncomeAccountRef`; store `qbo_item_id` |
| Quote (sent) | `Estimate` | optional; line items map to `SalesItemLineDetail` |
| Quote (signed) | `Invoice` | trigger on `signed`; one invoice per recommended scenario |
| Payment in UltraQuote | `Payment` | applied against the invoice |
| Tax rate (`tenant_settings.default_tax_rate`) | `TaxCode`/`TaxRate` | QBO has its own tax engine (AST in US) — mapping needed |

**Create an Item** — `POST /v3/company/{realmId}/item`:
```json
{ "Name": "Professional Services", "Type": "Service", "IncomeAccountRef": { "value": "1" } }
```

**Create an Invoice** — `POST /v3/company/{realmId}/invoice`:
```json
{
  "CustomerRef": { "value": "<customerId>" },
  "Line": [{
    "Amount": 100.0,
    "DetailType": "SalesItemLineDetail",
    "SalesItemLineDetail": { "ItemRef": { "value": "1" }, "Qty": 1, "UnitPrice": 100.0 }
  }]
}
```
(Estimate has the same `Line` shape — build once, reuse for both.)

**Concurrency / updates:** every entity carries a `SyncToken`; sparse updates must send the current
token (optimistic locking). Mirrors our quote-status race handling — same discipline.

**Rate limits:** 500 req/min/company, **10 concurrent**, batch endpoint 120/min. Over-limit → HTTP
429, code `003001`; use exponential backoff. Per-tenant volume is low, so this is mostly about
backoff hygiene, not throughput.

**Webhooks:** push Create/Update/Delete/Merge/Void; verify `intuit-signature` (HMAC-SHA256),
CloudEvents payload with **metadata only** (query by id for full data). Make handlers idempotent via
`SyncToken`. Useful to detect "invoice paid in QBO" → flip our quote/notes. (We already run a
webhook-secret pattern for DocuSeal — reuse the approach.)

**Sandbox + SDKs:** every dev account gets a pre-seeded sandbox company (up to 5). Official SDKs:
Java, .NET, PHP. Community: `node-quickbooks`, `python-quickbooks`. We'd likely call the REST API
directly from a Next.js route (we already do server-side fetch patterns) or use `node-quickbooks`.

**Tax caveat:** US QBO uses Automated Sales Tax (AST) — you often **can't** set an arbitrary tax
rate on a line; QBO computes it from the customer's address + nexus. Our `quotes.tax_rate` snapshot
may diverge from QBO's computed tax. Decide whether the invoice mirrors our number (override) or
defers to QBO. This is the single biggest fidelity gotcha.

---

## 4. Autotask PSA REST API — technical notes

**Auth:** API-user credentials sent as **request headers** (not OAuth):
- `ApiIntegrationCode` (the tracking identifier issued to the integration/vendor),
- `UserName` (a dedicated API user, security level "API User"),
- `Secret` (that user's key).
Plus optional `ImpersonationResourceId` for acting as a specific resource.
The tenant's admin creates the API user; we supply our `ApiIntegrationCode`.

**Zones / base URL:** Autotask is multi-zoned. First call
`GET /ATServicesRest/V1.0/zoneInformation?user=<apiUser>` to discover the account's **zone base URL**,
then issue all subsequent calls against that zone (e.g. `https://webservicesN.autotask.net/ATServicesRest/...`).
Don't hardcode a zone — resolve it per tenant at connect time and cache it.

**Entity mapping (UltraQuote ↔ Autotask):**

| UltraQuote concept | Autotask entity | Notes |
|---|---|---|
| Catalog product (`products`) | `Products` (+ `ProductTiers`, `ProductVendors`) | PSA is source of truth; import/sync into our catalog, store `at_product_id` |
| Client (`clients`) | `Companies` + `Contacts` | search-or-create |
| Quote (deal) | `Opportunities` | create on send; **update status on won/lost** |
| Quote document | `Quotes` + `QuoteItems` (+ `QuoteLocations`, `QuoteTemplates`) | Autotask has native quotes — could push our line items as QuoteItems |
| Recurring services | `Contracts` + `ContractServices` / `ContractCharges` | for MRR lines (managed services) |
| Billing | `Invoices` / `BillingItems` / `Charges` | **Autotask invoices**, not us, in the PSA-led model |
| Tax | `TaxCategories` / `TaxRegions` | map our tax rate |

**Query model:** REST but query-heavy — POST a query filter to
`.../V1.0/{Entity}/query` with a JSON filter object; some fields are non-queryable and field
visibility depends on the API user's security level. Child entities (e.g. `QuoteItems`) are often
addressed under their parent.

**Limits / supportability:** Autotask publishes **query thresholds + latency** rules (per-DB-call
thresholds, throttling, and a result cap that requires pagination). Respect pagination
(`PageDetails`/`nextPageUrl`) and back off on threshold responses. No OAuth token refresh dance, but
credentials are long-lived secrets — store encrypted per tenant.

**Webhooks:** Autotask supports notification/webhook configuration for some entities; less uniform
than QBO. For status round-trips (opportunity won in PSA → reflect in UltraQuote) we may need polling
as a fallback. `ExecuteCommand`/LiveLinks (used by Quoter) are for deep-linking into the PSA UI, not
data sync.

---

## 5. Architecture sketch for UltraQuote (for the later build)

**New per-tenant config (DB):** an `integrations` table — `provider` (qbo|autotask), encrypted
credentials/tokens, `realm_id`/zone, `is_active`, and a JSON `mapping` (account refs, tax mapping,
status mapping, "create estimate?", "create invoice on signed?"). Owner-only, like other settings.

**Linkage columns:** add nullable external-id columns rather than overloading existing ones:
- `clients.qbo_customer_id`, `clients.at_company_id`
- `products.qbo_item_id`, `products.at_product_id`
- `quotes.qbo_estimate_id`, `quotes.qbo_invoice_id`, `quotes.at_opportunity_id`

**Triggers (reuse existing lifecycle):**
- Quote **sent** → optionally create/update QBO Estimate or Autotask Opportunity.
- Quote **signed** (DocuSeal webhook already fires) → create QBO Invoice / advance Autotask
  opportunity to won + create sales order/contract charges.
- Payment recorded → QBO Payment.

**Token/secret handling:** encrypted at rest (Supabase — consider pgcrypto or app-layer encryption,
not plaintext columns). For QBO, a background refresh job (or refresh-on-use with mutex) to rotate
the refresh token and persist the newest one. This is the riskiest operational piece.

**Sync direction rules (source of truth):**
- Products: **QBO** create-from-us is fine; **Autotask** = PSA owns the catalog, we import/link.
- Clients: search-or-create in both; we store the external id.
- Money (invoices): QBO model = we create invoices; Autotask model = PSA creates invoices, we just
  push the opportunity/sales order.

**Build order recommendation:**
1. **QBO first** — self-contained, OAuth is well-documented, sandbox is instant, and it delivers the
   headline "quote → invoice" value to small MSPs with the least dependency on another vendor's data
   model. Start with: connect (OAuth) → customer search/create → invoice-on-signed → payment.
2. **Autotask second** — more config (zones, API user, product import, opportunity/status mapping),
   higher-touch onboarding, and only relevant to MSPs already on Autotask.

**Open questions to resolve before building:**
- Estimate *and* invoice, or invoice only? (Quoter does both; estimate is optional polish.)
- Tax: mirror our computed tax onto the QBO invoice, or defer to QBO's AST? (fidelity vs. correctness)
- Multi-scenario quotes: which scenario becomes the invoice — the recommended one? (we already pick
  "recommended or first" for dashboard math — reuse that rule.)
- One-time vs. recurring lines (setup fees + MRR): QBO invoice is one-shot; recurring belongs in QBO
  recurring transactions or, in the Autotask model, in `ContractServices`. Needs a mapping decision.
- Intuit/Autotask **app review/listing**: production QBO apps need Intuit app review; Autotask needs
  an integration vendor `ApiIntegrationCode`. Factor lead time in.

---

## 6. Source links
- QBO API overview: https://developer.intuit.com/app/developer/qbo/docs/develop
- QBO create invoice: https://developer.intuit.com/app/developer/qbo/docs/workflows/create-an-invoice
- QBO API guide (OAuth, limits, webhooks): https://dev.to/zuplo/quickbooks-api-complete-developers-guide-2026-3l77
- Autotask REST entities: https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/_EntitiesOverview.htm
- Autotask REST intro/auth/zones: https://www.autotask.net/help/developerhelp/Content/APIs/REST/General_Topics/Intro_REST_API.htm
- Autotask NodeJS library (reference impl): https://github.com/apigrate/autotask-restapi
- Quoter + QBO: https://www.scalepad.com/quoter/integrations/quickbooksonline/
- Quoter + Autotask: https://www.scalepad.com/quoter/integrations/datto-autotask/
- Kaseya Quote Manager + Autotask: https://help.quotemanager.kaseya.com/help/Content/2-integrate/autotask/autotask-integration-overview.htm
- Zomentum + Autotask: https://help.zomentum.com/support/solutions/articles/44001819373
