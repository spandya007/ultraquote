# Product Fields — what's surfaced, what's hidden, what's dropped on import

Reference for Sameer. Snapshot as of 2026-06-11. Two parts:
1. `products` table columns NOT shown in the UI.
2. Original Zomentum CSV columns dropped during import.

---

## 1. `products` columns NOT surfaced in the UI

The Add/Edit **Product drawer** surfaces: Name, Description, Category, Item
Type, Billing Period, Unit label, Taxable / Price-overrideable / Active
checkboxes, Manufacturer, Manufacturer Part No., Supplier Name, Supplier SKU,
and **per pricing tier**: tier name, Cost Price, Sell Price, tier description,
Default flag (+ the live margin readout added 2026-06-11).

The **Products list** shows: Name, Category, Type, Billing, Cost, Price,
Margin, Tiers count, Active.

These DB columns exist but have **no edit field anywhere** in the UI:

| Column | Why it's hidden / notes |
|---|---|
| `unit_cost` (product-level) | Effectively legacy. Pricing is tier-driven; the list shows the **default tier's** cost and only falls back to this column. The drawer never writes it (manual products leave it null). |
| `unit_price` (product-level) | Same as above — superseded by tier pricing. |
| `zomentum_id` | Internal/legacy grouping + re-import key. Deliberately never shown (see CSV import design — system-neutral externally). |
| `autotask_id` | Stored if present in the CSV, but no UI. Reserved for a future Autotask integration. |
| `quickbooks_online_id` | Same — stored, no UI, reserved for QuickBooks. |
| `source` | Internal provenance: `manual` / `csv` / `document_import`. Set automatically. |
| `source_quote_id` | Internal — set when a product is created via "Extract pricing" from a quote document (migration 002 audit trail). |
| `id`, `tenant_id`, `created_at` | System columns (not user fields). |

**Takeaways worth remembering:**
- `setup_price` is now editable in the drawer (Details → Setup Price, added
  2026-06-11) and **flows into quotes**: when a product is added to a scenario,
  its setup fee (× qty) folds into the scenario's one-time total and shows
  per-line + in the PDF/Preview. Previously imported-but-hidden and inert.
- The product-level `unit_cost`/`unit_price` columns are redundant with tier
  pricing; the app treats the **default tier** as the source of truth.

---

## 2. Original Zomentum CSV columns — mapped vs dropped

Your `Product-export.csv` had **33 columns**. The importer maps **17** and
ignores **16**. (Header matching is now alias-based and case-insensitive, but
these are the original Zomentum spellings.)

### Mapped (17 → product/tier fields)

| CSV column | Maps to |
|---|---|
| Zomentum Id | `zomentum_id` (internal grouping + re-import key) |
| Item Name | `name` |
| Item Type | `item_type` |
| Item Description | `description` |
| Pricing Name | pricing tier name |
| Pricing Description | pricing tier description |
| Billing Period | `billing_period` |
| Cost Price | tier `unit_cost` (+ product `unit_cost` on first row) |
| Sell Price | tier `unit_price` (+ product `unit_price` on first row) |
| Setup Price | `setup_price` (stored but not shown — see part 1) |
| Product Category | matched to a `product_categories` row |
| Manufacturer | `manufacturer` |
| Manufacturer Part No. | `manufacturer_part_no` |
| Supplier Name | `supplier_name` |
| Supplier SKU | `supplier_sku` |
| Autotask ID | `autotask_id` |
| Quickbooks Online ID | `quickbooks_online_id` |

### Dropped (16 — no column in our schema, silently ignored)

| CSV column | Category |
|---|---|
| Product Number | Identifier we don't store (distinct from Supplier SKU / MPN) |
| ASIN | Amazon identifier |
| AT Serialized | Autotask flag |
| AT Does not require Procurement | Autotask flag |
| Quickbooks Item Type | QuickBooks metadata |
| ConnectWise PSA ID | Integration ID |
| HaloPSA ID | Integration ID |
| Kaseya BMS ID | Integration ID |
| Repairshopr ID | Integration ID |
| Syncro ID | Integration ID |
| SuperOps ID | Integration ID |
| HubSpot ID | CRM ID |
| Infusionsoft ID | CRM ID |
| Salesforce ID | CRM ID |
| Xero Via N8n ID | Accounting ID |
| Sync Origin | Zomentum sync metadata |

**Pattern:** everything dropped is either a foreign-system identifier or a
PSA/CRM-specific flag. We deliberately keep only `autotask_id` and
`quickbooks_online_id` as integration anchors. **If you ever integrate with
ConnectWise, HaloPSA, Syncro, etc., the work is: add the column to `products`,
add a `HEADER_ALIASES` entry in `lib/import/csv-products.ts`, and (optionally)
surface it in the drawer.**

---

## Type (`item_type`) vs Category (`category_id`) — two independent axes

These are distinct classifications and are often confused:

- **Type (`products.item_type`)** — a **fixed, system-defined** field; DB `check` constraint allows
  exactly `Service | Hardware | Software | Other`. Describes *what kind* of thing the product is. Shown
  as a color-coded badge + a filter on the Products list. **Not editable** (hardcoded in the schema).
  Nullable.
- **Category (`products.category_id` → `product_categories`)** — a **tenant-defined, free-form grouping**
  (own table: `name`, `sort_order`, per tenant). Your own catalog buckets. Seeded with 6 defaults at
  tenant onboarding (Managed Services, Hardware, Software, Security, Cloud, Professional Services).
  Editable in principle (RLS allows owner insert/update/delete). Nullable → "Uncategorised".

So Type = product *nature* (rigid, for consistent badging/handling); Category = *your taxonomy* (flexible
per tenant). They can share names (e.g. "Hardware") but serve different purposes — e.g. a firewall might
be Category "Security" with Type "Hardware".

Neither drives pricing/billing math — `billing_period` (Monthly/One Time) and `is_taxable` do. Type and
Category are purely classification / filtering / display.

**UI gap (as of 2026-06-19):** there is **no category-management UI**. Categories are only created by the
`provision_tenant` seed; the product drawer lets you *pick* an existing category but not add/rename/delete
one. RLS already permits owner CRUD — surfacing a small owner-only category manager (Settings or Products
page) is the missing piece to make categories truly "customizable per tenant."
