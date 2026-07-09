# UltraQuote — Stripe Billing Design (v2)

Status: **design / not built** (2026-07-08, Opus 4.8). This is the implementation-focused **billing** design
(the *how*). The **pricing** (the *what* — tiers, list prices, included docs) is frozen in
`docs/pricing-model-design.md` §2 (v2). Onboarding paths: `docs/self-serve-onboarding-design.md`
(self-serve pay-per-use) + `docs/tenant-onboarding-design.md` (admin invite). Access lifecycle it plugs
into: `docs/subscription-and-access-lifecycle-design.md` + `lib/access/access-state.ts`.

> **Why a new doc:** `pricing-model-design.md` §4–§10 describe a Stripe architecture written for **v1**
> (three tiers + **$10/seat add-ons** + soft doc caps). v2 changed the shape (five fixed tiers, **no seat
> add-ons**, flat **$3/doc** overage, AI as a flat non-billed fair-use cap). This doc is the **v2-accurate,
> buildable** billing spec and **supersedes pricing §4–§10** where they conflict. Pricing §2 (tiers) and §5a
> (admin-editable prices + discounts) still stand.

---

## Part A — How Stripe does billing (primer, mapped to us)

Stripe billing is built from a small set of objects. Understanding these makes the rest of the doc obvious.

### A.1 Core objects
- **Customer** — one per paying entity. Holds payment methods, address, invoices, subscriptions.
  → **We map one Stripe Customer per tenant** (`tenants.stripe_customer_id`, column already exists).
- **Product** — a thing you sell (e.g. "UltraQuote Pro"). A container; not itself priced.
- **Price** — an immutable price attached to a Product. Key attributes:
  - `recurring` (subscription) vs `one_time`.
  - `recurring.usage_type`: **`licensed`** (a fixed quantity billed each period — our flat monthly fee) or
    **`metered`** (billed on reported usage — our per-doc overage and pay-per-use).
  - `billing_scheme`: **`per_unit`** (unit price × qty) or **`tiered`** (graduated/volume tiers — lets us do
    "first N docs free, then $3").
  - **Prices are immutable** — you never "edit" a price; you create a new Price and point new checkouts at it
    (existing subscriptions keep their old Price until migrated). This is why §5a stores `stripe_price_id` in a
    config table.
- **Subscription** — a Customer's recurring commitment to one or more Prices (each = a **subscription item**).
  Has a `current_period_start/end`, a `status` (`active | trialing | past_due | canceled | unpaid | incomplete`),
  and generates an **Invoice** each period. **A single subscription can mix a licensed item (flat fee) and a
  metered item (overage)** — exactly our tier + overage shape.
- **Invoice** — the bill for a period. Stripe finalizes it, charges the card, retries on failure (dunning), and
  fires webhooks (`invoice.paid`, `invoice.payment_failed`).
- **Coupon / Promotion Code** — a discount (`percent_off` or `amount_off`, `duration = once|repeating|forever`).
  Attach a Coupon to a subscription and Stripe applies it to every invoice automatically, **including metered
  usage** — no discount math on our side. → our per-tenant admin discount (§5a).

### A.2 Usage-based (metered) billing — the current API
For metered prices (overage, pay-per-use) Stripe's **current** mechanism is the **Billing Meters** API
(GA 2024; it replaces the legacy `subscriptionItem.createUsageRecord` flow for new integrations):
1. Create a **Meter** once (e.g. `event_name = "uq_document_completed"`, aggregation `sum` or `count`).
2. Create a **metered Price** linked to that meter (`recurring.meter = <meter_id>`, `usage_type = metered`).
3. As usage happens, POST a **Meter Event** to `/v1/billing/meter_events`
   (`{ event_name, payload: { stripe_customer_id, value } }`).
4. Stripe aggregates meter events over the period and puts the total on the invoice.

We recommend the Meters API (not legacy usage records). Design so the "report a completion" call is a single
function (`reportCompletionToStripe`) we can swap if Stripe's API shifts again.

### A.3 The two self-serve UIs Stripe gives us (no custom card forms)
- **Checkout** — a hosted, PCI-compliant page to start a subscription / collect a card. We create a Checkout
  Session server-side, redirect the user, and get a webhook when they finish. → "Choose a plan" / "Add a card."
- **Customer Portal** — a hosted page where a customer updates their card, sees invoices, switches plan, or
  cancels. We generate a portal link server-side. → our Settings → Billing "Manage billing" button. Massively
  reduces what we build.

### A.4 Webhooks are the source of truth
Card charges, renewals, failures, and cancellations happen **on Stripe's side, asynchronously**. Stripe tells us
via **webhooks** (signed with a secret we verify, exactly like the DocuSeal webhook). **Never infer billing
state from the redirect** — always reconcile from webhook events. Our DB mirrors Stripe; Stripe is authoritative.

### A.5 Test mode
Stripe has fully isolated **test** and **live** modes (separate keys, data, webhooks). We build and verify
entirely in test mode with test cards + the **Stripe CLI** (`stripe listen --forward-to …` to replay webhooks
locally), then flip to live keys — mirroring how DocuSeal sandbox→prod was handled.

---

## Part B — UltraQuote v2 billing design

### B.1 Mapping v2 tiers → Stripe objects
Frozen v2 pricing (from pricing §2; **default list prices — admin-editable per §5a, not hardcoded**):

| Plan | Price | Users | Included signed docs/mo | Overage |
|---|---|---|---|---|
| **Pay-per-use** | $9 / completed doc | 1 | n/a (per doc) | n/a |
| **Starter** | $30 / mo | 1 | 5 | $3 / doc |
| **Standard** | $50 / mo | 2 | 10 | $3 / doc |
| **Pro** | $80 / mo | 5 | 25 | $3 / doc |
| **Ultra** | $150 / mo | 10 | 50 | $3 / doc |

**Stripe structure (recommended):**
- **One Product per plan** (`UltraQuote Starter/Standard/Pro/Ultra`, + `UltraQuote Pay-per-use`).
- **Subscription tiers (Starter…Ultra)** = a subscription with **two items**:
  1. a **licensed** Price = the flat monthly fee ($30/$50/$80/$150), qty 1.
  2. a **metered** Price = **document overage**. Two ways to model the "first N free":
     - **Recommended — tiered metered price per plan:** graduated tiers `[up_to: included → $0, then → $3/doc]`.
       We report **every** completed doc as a meter event and Stripe applies the free allotment + overage
       automatically. Cleaner (no threshold math on our side; upgrades/downgrades handled by swapping the item).
     - *Alternative — flat $3 metered price + we only report events past the included count.* Requires us to
       track the running monthly count and decide when to start reporting. More app logic; not recommended.
- **Pay-per-use** = a **$0 licensed base** (so a subscription exists to carry the customer + coupon) **+ one
  metered Price at $9/doc flat** (`per_unit`, no free tier). Report every completed doc.

> Users/seats are **fixed per tier** in v2 (no add-ons). Seats are **not** a Stripe quantity — they're an
> in-app limit (B.5). This is a big simplification vs pricing §6/§7 (v1), which are **superseded** here.

### B.2 The metering event (precise)
A **completed document** is billed **once per completed signing round**. The exact trigger in code today:
`app/api/webhooks/docuseal/route.ts`, on `form.completed`/`submission.completed` when **all signers are done**,
sets **`quotes.status = 'signed'`** (`signed_at`, `pdf_url`) and the **`quote_signature_sessions` row →
`status = 'completed'`** (`completed_at`, `signed_document_url`).

> ⚠️ Correction to pricing §3: on the **quotes** table the terminal status is **`signed`**, not `completed`
> (`completed` is the **signature session** status). The billing hook keys off the **session completion**, which
> is the unambiguous "this round finished" event and naturally supports re-sends (decision #11: a re-sent &
> re-signed quote is a **new session** → counts again).

**Hook:** in that same webhook branch (right after the session→completed / quote→signed updates), call
`recordDocumentCompletion(tenantId, quoteId, sessionId)`:
1. Insert a `document_completions` row (idempotent — unique on **`signature_session_id`**). If the row already
   exists, stop (dedupes webhook retries).
2. Look up the tenant's plan. If billable (any subscription/pay-per-use plan with a Stripe subscription), call
   `reportCompletionToStripe(customerId)` → POST a `uq_document_completed` meter event (value 1). Mark
   `document_completions.reported_to_stripe = true`.
3. Beta / unbilled tenants: insert the ledger row (for analytics) but skip Stripe.

Keying on `signature_session_id` (not `quote_id`) means the ledger is the durable audit of *every* billable
completion, retry-safe, and re-send-aware.

### B.3 Data model
**Reuse (already exist):** `tenants.stripe_customer_id`, `tenants.subscription_start/end/term`,
`tenants.platform_enabled`, `tenants.suspended_at/reason`, the access resolver, the DocuSeal completion webhook.

**New columns on `tenants`:**
- `plan text not null default 'beta'` — `'beta' | 'pay_per_use' | 'starter' | 'standard' | 'pro' | 'ultra'`.
- `stripe_subscription_id text`
- `plan_status text` — mirrors Stripe (`active | trialing | past_due | canceled | unpaid | incomplete`).
- `seat_limit int` — derived from plan (1/1/2/5/10) but stored for fast checks + manual override.
- `included_docs int` — derived from plan (0/5/10/25/50) but stored for fast checks + display.
- `current_period_end timestamptz` — mirror of Stripe's period end; **drive `subscription_end` from this** so the
  existing access resolver (grace/expired) keeps working unchanged.
- **Discount (per §5a):** `discount_type text`, `discount_value numeric`, `discount_note text`,
  `discount_until date`, `stripe_coupon_id text`.

**New table `document_completions`** (the completion/usage ledger):
`id, tenant_id, quote_id, signature_session_id (unique), completed_at, billing_period (YYYY-MM),
reported_to_stripe boolean default false, created_at`. One row per billable completion → per-period count is a
cheap `count(*) where billing_period = …`. RLS: owner-read own tenant; service-role write (like `ai_usage`).

**New table `pricing_config`** (admin-editable list prices, §5a): `plan, unit ('month'|'doc'),
amount_cents, stripe_price_id, active, updated_at`. **No client RLS policies — service-role only** (like
`platform_admins`). Editing a price = create a new Stripe Price + repoint `stripe_price_id` (immutability, A.1).

**Plan catalog in code** `lib/billing/plans.ts` — the single source of truth mapping `plan → {seat_limit,
included_docs, display copy, stripe product ref}`. **Non-price attributes only**; prices come from
`pricing_config` (never hardcoded).

**Migration:** one migration `0NN_billing.sql` adds the `tenants` columns + the two tables + indexes. Backfill
`plan='beta'` for all existing tenants (unlimited, no card — matches today).

### B.4 Stripe webhook `/api/webhooks/stripe`
Verify the Stripe signature (`stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`). Handle
**idempotently** (store processed `event.id`, or make each handler upsert-safe). Events → effect:
- `checkout.session.completed` → link `stripe_customer_id`/`stripe_subscription_id` to the tenant; set `plan`.
- `customer.subscription.created|updated` → sync `plan`, `plan_status`, `seat_limit`, `included_docs`,
  `current_period_end` → recompute `subscription_end`.
- `customer.subscription.deleted` → `plan_status='canceled'`; let `subscription_end` drive the existing
  **grace → expired** path (no special-casing — reuse the access lifecycle).
- `invoice.paid` → `plan_status='active'`; advance `current_period_end`/`subscription_end`.
- `invoice.payment_failed` → `plan_status='past_due'` → after Stripe's dunning retries exhaust, the subscription
  goes `unpaid`/`canceled` → same grace→read-only machinery.

**Metering direction is one-way:** *we* push meter events to Stripe (B.2); the webhook is Stripe→us for
*subscription/payment* state. Keep the two flows separate.

### B.5 Metering & enforcement (v2 — no seat add-ons)
- **Completed-doc billing:** handled entirely by B.2 + the tiered/metered Stripe price. **Overage never blocks
  sending** — a doc completing past the included count just bills $3; we surface an ~80%/100% nudge to upgrade.
- **Seats = fixed per tier, enforced in-app** (NOT a Stripe quantity). Block the **Team invite** route
  (`/api/team/invite`) when `count(public.users) >= seat_limit`, with an "upgrade to add users" prompt. No
  proration, no seat-release logic (v2 has no per-seat billing — this deletes all of pricing §6's seat-quantity
  complexity). Owner seat always counts.
- **Tie into `lib/access/access-state.ts`:** extend the resolver (or a sibling `billing-state.ts`) to also
  expose `plan`, `seat_limit`, `included_docs`, and current-period completed count. **Write-guards
  (`canWrite`) stay a hard gate for access lapse**; seat/doc limits are **friendly nudges**, not lockouts.

### B.6 Discounts & admin pricing (per pricing §5a — unchanged, restated for completeness)
- **Per-tenant discount:** admin sets `discount_type/value` in `/admin → Manage tenant`; we create/attach a
  **Stripe Coupon** to the tenant's subscription. Stripe applies it to every invoice (flat + overage +
  pay-per-use) automatically. Display base/discount/net on Settings → Billing and the /admin tenant view.
- **Admin list-price editing:** `/admin → Pricing` panel edits `pricing_config`; each edit **creates a new
  Stripe Price** and repoints `stripe_price_id`. New checkouts use the new price; existing subs keep theirs
  (document; no auto-migrate in v1).
- **Promotion codes** (customer self-apply at checkout): defer.

### B.7 Lifecycle (plan changes)
Reuse pricing §7 (still valid under v2, minus seats):
- **Upgrade = immediate + prorated;** grant the higher `included_docs` right away (don't prorate the doc count).
- **Downgrade = at period end** (Stripe subscription schedule) — prevents "hop up for a heavy month" gaming.
- **Cancel = at period end** → existing **7-day read-only grace** → expired block (already built).
- **Pay-per-use ↔ subscription** is a plan change, same rules.
- **Past-due:** `invoice.payment_failed` → `past_due` → Stripe dunning → grace→read-only if it exhausts.
- Self-serve does upgrades/downgrades/card updates via the **Customer Portal**; we don't build those screens.

### B.8 Onboarding integration
- **Beta → paid (existing tenants):** at GA, set each tenant's `subscription_end` to a grace window; the existing
  **expiry-reminder banner** warns in the final 7 days with its CTA repointed to **Settings → Billing** (plan
  selection). Lapse → normal grace→read-only until they pick a plan. No card until they choose.
- **Self-serve signup (pay-per-use):** the `/signup` flow (shipped, PR #21) already provisions a standalone
  tenant. Billing adds: after email-verify, prompt to add a card (Checkout) and set `plan='pay_per_use'`.
  **Trial guard (open, §D):** stamp a `subscription_end` (trial window) and/or require card-on-file so a
  never-signing signup can't accrue cost — ties to the free-AI-allowance question in self-serve §6/§10.
- **AI cost is OUT of billing scope:** the 25-call/quote AI cap (pricing §12.3) is a flat, non-billed fair-use
  ceiling, already enforced in the AI routes. Stripe never sees AI usage. Don't conflate it with metering here.

---

## Part C — Build phases (each shippable; test mode throughout)
- **Phase 0 — Foundation:** `lib/billing/plans.ts` catalog; migration (tenants billing columns + discount +
  `document_completions` + `pricing_config`); Stripe SDK + test keys + **Customer creation** on tenant
  provision; `/api/webhooks/stripe` skeleton (signature verify + event log), all in test mode.
- **Phase 1 — Subscriptions + admin pricing:** Checkout + Customer Portal; **Settings → Billing** page
  (plan, base/discount/net, current period, "Manage billing"); subscription webhooks → `plan`/`plan_status`/
  `current_period_end`→`subscription_end`; Starter/Standard/Pro/Ultra purchasable; **/admin Pricing panel**
  (new Stripe Price on edit) + **per-tenant discount** (Stripe Coupon).
- **Phase 2 — Metering & caps:** `recordDocumentCompletion` in the DocuSeal webhook → ledger; tiered/metered
  Stripe prices (included-free + $3 overage); usage display on Settings → Billing; **seat cap** on team-invite.
- **Phase 3 — Pay-per-use + nudges:** $0-base + $9 metered price; card-at-signup / trial guard; upgrade nudges
  (pay-per-use→Starter at ~4 docs; seat/doc-cap prompts).
- **Phase 4 — Polish:** dunning (past-due→grace copy), downgrade scheduling, annual plans (~2 months free),
  **Stripe Tax**, promotion codes.
- **Prereq throughout:** DocuSeal moved sandbox→Pro+production (real per-doc cost basis + real completions).

## Part D — Open decisions (recommended default in *italics*)
1. **Overage price shape:** tiered metered price (report all, Stripe applies free allotment) vs flat $3 + app-side
   threshold. *Tiered — less app logic, Stripe-native.*
2. **Trial for self-serve pay-per-use:** card-on-file at signup vs a free trial window (+ small free-AI/doc
   allowance) then card. *Free trial window (stamp `subscription_end`) + require card before first send; a small
   AI allowance already bounded by the 25-call cap.*
3. **Beta→paid grace length** at GA. *30–60 days, reuse the expiry banner.*
4. **Re-completed quote counts again?** (Decision #11 = yes.) *Yes — key the ledger on `signature_session_id`.*
5. **Annual plans** now or Phase 4. *Phase 4, ~2 months free.*
6. **Stripe Tax** now or later. *Later (Phase 4) — out of v1.*
7. **Self-serve owners editing Company Name/Email** (migration 013 lock has no admin who set them). *Allow for
   self-serve-created tenants; keep the lock for admin-invited ones.*

## Part E — Env & security
- **Env (Netlify, All Scopes — the server-var gotcha):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PUBLISHABLE_KEY` (client), plus the Stripe **Price/Product IDs** live in `pricing_config` (DB), not env.
- **Webhook security:** verify the Stripe signature on every event; **idempotency** (dedupe on `event.id`) so
  retries don't double-apply; ledger dedupe on `signature_session_id` so completions can't double-bill.
- **Least privilege:** all Stripe calls + ledger writes are **service-role, server-side only** (never client).
- **Reconcile, don't trust redirects:** post-Checkout success page is cosmetic; DB state changes only on webhook.

## Part F — What this supersedes / cross-refs
- **Supersedes** pricing `docs/pricing-model-design.md` **§4, §5, §6, §7, §8** (v1 seat add-ons / three tiers).
- **Keeps** pricing **§2** (v2 tiers), **§5a** (admin pricing + discounts), **§3/§6 metering intent** (corrected
  here: session-completion event), **§12/§13** (AI cost — out of billing scope).
- **Cross-refs:** `docs/self-serve-onboarding-design.md` (signup + trial guard),
  `docs/subscription-and-access-lifecycle-design.md` (grace/expired/suspend it reuses),
  `docs/pricing-cost-model.html` (the What-If margin model — draft:sign ratio etc.).
