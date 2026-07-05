# UltraQuote — Pricing Model Design (v1, for iteration)

*Author: Claude (Opus 4.8), 2026-06-19. Design for three tiers — Pay-per-use, Starter, Team — built on
Stripe billing + completed-document metering, layered on the existing access lifecycle. Public API is a
later phase (see §11). This is a working draft to iterate on; bracketed items are open decisions (§9).*

---

## 1. Goals & scope
- Monetize via **three tiers: Pay-per-use, Starter, Team** (drop Unlimited/white-label/API for now —
  see `docs/pricing-and-white-label-notes.md`).
- Bill on **delivered value = completed (fully-signed) documents**, not quotes created or sent.
- Reuse the existing access lifecycle (`lib/access/access-state.ts`, migration 012) rather than replace
  it: platform kill switch + per-user kill switch + read-only grace all stay; billing drives the
  subscription window and adds plan/seat/doc-cap awareness.
- Self-serve where possible (Stripe Checkout + Customer Portal) so onboarding/upgrades don't need admin.

## 2. Tier definitions (v1 — default list prices, admin-editable per §5a)

| | **Pay-per-use** | **Starter** | **Team** | **Team Ultra** |
|---|---|---|---|---|
| Base price | $0/mo + **$9 / completed doc** | **$29 / mo** | **$79 / mo** | **$159 / mo** |
| Included seats | 1 (owner) | 1 | 5 | 10 |
| Additional seats | — | **+$10/seat (+5 docs/seat), up to 3 total** | **+$10/seat (+5 docs/seat), up to 10 total** | — (at cap) |
| Included docs/mo | pay per doc | 10 | 50 | 100 |
| Overage (docs beyond included) | n/a (per-doc) | **$3 / completed doc** | **$3 / completed doc** | **$3 / completed doc** |
| Quotes (create/send/preview/PDF) | Unlimited | Unlimited | Unlimited | Unlimited |
| Templates, catalog, AI, dark mode, etc. | All | All | All | All |
| Annual option | — | [~2 months free] | [~2 months free] | [~2 months free] |

> ⚠️ Dollar amounts are **default list prices, NOT hardcoded** — admin-editable, and each tenant can
> carry a discount. See §5a.

**Seat add-ons (Starter & Team):** +$10/seat/month, each added seat also adds +5 included docs/month.
This reproduces a smooth ladder from one base plan instead of many SKUs (Stripe handles it via
subscription seat *quantity*). E.g. Starter: 1u/10d = $29 · 2u/15d = $39 · 3u/20d = $49. Caps: Starter
≤ 3 users, Team ≤ 10 users.

**Flat $3 overage, every tier.** One transparent number ("$3 per completed document beyond your plan's
monthly included docs, on any plan"). Always cheaper than Pay-per-use ($9) so subscribing always wins;
above each tier's effective in-plan rate (Starter $2.90, Team $1.58, Ultra $1.59) so heavy users are
nudged to upgrade rather than ride overage. No hard doc cap — overage replaces it (friendlier, never
blocks mid-deal).

**Ladder is flaw-free (checked):** Team + 5 add-on seats = $129 / 10 users / 75 docs; Team Ultra =
$159 / 10 users / 100 docs. For ≤75 docs the add-on route is cheaper (users pick it); past ~75 docs,
overage on the add-on route ($129 + 25×$3 = $204) exceeds Team Ultra ($159) → clean crossover, no
configuration beats a higher plan on the same dimensions.

Notes:
- **Quotes are always unlimited** on every tier — only *completed documents* meter (DocuSeal cost +
  delivered value live there).
- Pay-per-use is the no-commitment / post-beta path. Breakeven vs Starter ≈ 3.2 docs/mo → nudge at 4.

## 3. What is metered: "completed documents"
- A **completed document** = a quote whose signing round fully completes. The DocuSeal webhook
  (`app/api/webhooks/docuseal/route.ts`) already transitions a quote to **`completed`** (with
  `completed_at`, signed PDF URL) when all signers finish. **That transition is the single metering
  event.** Quotes created, sent, viewed, or declined do NOT count.
- Dedup: count each quote at most once (a quote can't "complete" twice in a normal lifecycle; a re-send
  creates a fresh round — decide whether a re-completed quote counts again, §9).

## 4. Billing architecture (Stripe)
- **Stripe Customer per tenant** (`tenants.stripe_customer_id`).
- **Starter / Team = recurring Subscriptions** (fixed monthly price). Stripe Checkout to start; Customer
  Portal for plan change / card update / cancel.
- **Pay-per-use = usage-based billing.** Cleanest: a $0-base Stripe subscription with a **metered price**
  ($9/unit); we report a usage record to Stripe each time a document completes; Stripe invoices monthly
  in arrears. (Alternative considered: immediate per-doc charge — rejected; metered monthly invoice is
  simpler + fewer card charges. Alt: prepaid doc credits — more UX, defer.)
- **Webhooks** (`/api/webhooks/stripe`): `checkout.session.completed`,
  `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed` → update the
  tenant's plan state + subscription window. Verify Stripe signature (like the DocuSeal webhook secret).
- **Test mode first** (Stripe test keys) — mirrors how DocuSeal sandbox→prod was handled.

## 5. Data model
Augment `tenants` (or a dedicated `tenant_billing` table — recommend columns on `tenants` for v1):
- `plan text` — `'beta' | 'pay_per_use' | 'starter' | 'team'` (default `'beta'` for current users).
- `stripe_customer_id text`, `stripe_subscription_id text`.
- `plan_status text` — mirror Stripe (`active | past_due | canceled | trialing | unpaid`).
- `seat_limit int`, `doc_cap int null` (null = unlimited) — derived from plan but stored for fast checks
  + manual overrides.
- Drive `subscription_end` (existing column) from Stripe's `current_period_end` so the existing
  access resolver keeps working unchanged (grace/expired logic already handles a lapsed window).

New **usage ledger** table `document_completions` (auditable, dedup-friendly):
- `id`, `tenant_id`, `quote_id` (unique per completion), `completed_at`, `billing_period` (YYYY-MM),
  `reported_to_stripe boolean` (for pay-per-use). One row per completed doc → counting per period is a
  cheap `count(*)`.

A small **plan catalog** in code (`lib/billing/plans.ts`): plan keys, seat_limit, doc_cap, display copy,
and the *non-price* attributes — single source of truth mapping `plan` → limits. **Prices are NOT
hardcoded here** (see §5a); the catalog references the current price config + Stripe price IDs.

## 5a. Admin-controlled pricing & discounts (NEW — requested 2026-06-19)
Pricing must be **configurable by the Platform Admin**, with a base amount per plan plus a per-tenant
discount the admin controls. Two layers:

**(1) Base/list prices — admin-editable, not hardcoded.**
- Store the current list price for each plan in a platform-level config table `pricing_config`
  (`plan`, `unit` = `'month' | 'doc'`, `amount_cents`, `stripe_price_id`, `active`, `updated_at`).
- The `/admin` console gets a **Pricing** panel to view/edit these (platform-admin only; the table has
  no client RLS policies — service-role only, like `platform_admins`).
- Stripe nuance: a Stripe **Price is immutable**. Editing a base price = create a NEW Stripe Price and
  point `pricing_config.stripe_price_id` at it. New checkouts use the new price; existing subscriptions
  keep theirs unless explicitly migrated (v1: don't auto-migrate; document it).

**(2) Per-tenant discount — admin-controlled, % or fixed $.**
- Columns on `tenants`: `discount_type text` (`'percent' | 'fixed'`), `discount_value numeric`
  (percent 0–100, or cents), `discount_note text`, `discount_until date null` (optional expiry),
  `stripe_coupon_id text`.
- Admin sets a tenant's discount in `/admin` → Manage tenant. We create/attach a **Stripe Coupon**
  (`percent_off` or `amount_off`, `duration` = forever / once / repeating, optional `redeem_by`) to that
  tenant's subscription. Stripe then applies it to every invoice automatically — including pay-per-use
  metered invoices.
- **Effective price = base − discount**, computed by Stripe; we display it (base, discount, net) on the
  tenant's Settings → Billing page and the /admin tenant view.
- Removing/zeroing the discount detaches the coupon from the subscription.

**(3) Optional later: promo codes.** Stripe Promotion Codes (public codes customers self-apply at
checkout) — defer to a later phase; the per-tenant admin discount covers the immediate need.

Why Stripe Coupons rather than custom math: discounts then apply consistently across proration,
renewals, and metered usage without us re-implementing billing arithmetic.

## 6. Metering & enforcement
- **Meter:** in the DocuSeal webhook, when a quote transitions to `completed`, insert a
  `document_completions` row (idempotent on `quote_id`). For pay-per-use tenants, also report a Stripe
  usage record (mark `reported_to_stripe`).
- **Seat enforcement:** `seat_limit` = included seats + purchased add-on seats. Block inviting members
  beyond it, with an "add a seat (+$10/mo)" or upgrade prompt. Add-on seats are a Stripe subscription
  *quantity* (each +$10 and +5 to `doc_cap`). Caps: Starter ≤ 3, Team ≤ 10. Hook the team-invite route.
- **Seat *release* on member removal (TODO when billing lands):** the seat basis is the count of
  `public.users` rows, so **deleting** a member must hook the same seat-quantity logic as inviting —
  decrement the Stripe subscription *quantity* (or free room under `seat_limit`) when a member is removed.
  Two existing removal paths must call this: (a) the owner's **Settings → Team** remove/disable, and (b)
  the **Platform Admin → Manage → Team members** manager (Remove / Delete account / Make-member), plus the
  Org-Admin dual-hat ✕. **Disable ≠ delete:** a *disabled* member keeps its `users` row → still a billed
  seat; only **delete** frees the seat. Decide proration policy: typical SaaS does **not** refund a
  mid-period seat removal — the freed seat is reusable and the lower count is billed at the next renewal
  (co-terminous seats, per `subscription-and-access-lifecycle-design.md` D1). Owner seat is never released
  while the workspace exists.
- **Doc overage (no hard cap):** completed docs beyond the monthly included amount are billed at a flat
  **$3/doc** via a metered Stripe price on the subscription — we report a usage record on each
  `completed` event past the included count. Never blocks sending; an ~80%/100% nudge suggests upgrading.
- **Integrate with access-state:** extend `lib/access/access-state.ts` so the resolver also exposes the
  plan + limits (it already returns `ok/grace/...`). Write-guards (`requireWriteAccess`) stay; add
  seat/doc-cap as separate, friendlier checks (not a hard lockout — they prompt upgrade).
- **Past-due / failed payment:** `invoice.payment_failed` → `plan_status='past_due'`; after Stripe's
  retries exhaust → treat like the existing **grace → read-only**, reusing that machinery.

## 7. Lifecycle: plan changes / upgrade / downgrade / cancel
**Plan-switch policy (DECIDED — industry-norm, gaming-resistant):** self-serve switching is allowed
(via Stripe Customer Portal + our Billing page); no artificial limit on switch frequency.
- **Upgrades = immediate + prorated.** User pays the prorated difference now and gets the higher
  limits instantly. On a mid-period upgrade, grant the new (higher) monthly included-doc cap right away
  — don't prorate the doc count (simpler + generous = no gotcha).
- **Downgrades = take effect at the END of the current billing period** (Stripe subscription schedule).
  This is the key norm: it prevents "hop up for one heavy month, drop back for a refund" gaming and
  avoids mid-cycle refunds.
- **Seat add/remove:** adding a seat is immediate + prorated; removing seats (or downgrading below
  current usage) applies at period end and **prompts the owner to remove members/resolve over-limit
  first** — never auto-deletes data.
- **Pay-per-use ↔ subscription** counts as a plan change and follows the same rules.
- **Cancel:** subscription ends at period end → existing **7-day read-only grace** → then expired block
  (already built). Data retained per the privacy policy (90 days post-termination).
- **Beta → paid transition (DECIDED):** current tenants are `plan='beta'` (unlimited, no card). At GA,
  extend each tenant's `subscription_end` to set a grace window; the existing expiry-reminder banner
  warns as that date nears, with its CTA repointed to plan selection (Settings → Billing). When the
  window lapses, normal grace→read-only applies until they pick a plan.

## 8. In-app upgrade nudges (depends on §6 metering)
- Pay-per-use: at 3 completed docs/mo → "one more and Starter is cheaper"; at 4 → "switch & save."
- Starter: on attempt to add a 2nd user → "Team adds teammates"; at ~80% of doc cap → cap warning.
- Team: at ~80% of doc cap → prompt (or "you're a heavy user — let's talk" if no Unlimited tier yet).
- Surface via the existing toast/banner system + a Settings → Billing page.

## 9. Open decisions
**DECIDED 2026-06-19:**
1. ✅ Starter doc cap: **10/mo included, SOFT cap** — allow a little over with an upgrade nudge,
   hard-block only well above. (No fixed overage price in v1; nudge to Team.)
2. ✅ Team doc cap: **50/mo included.**
3. ✅ Beta→paid transition: at GA, extend each tenant's `subscription_end` to give a grace window. As
   the end date approaches, the app prompts the owner to choose one of the three plans — **reuse the
   existing expiry-reminder banner** (already warns in the final 7 days before `subscription_end`),
   repointing its CTA to the plan-selection / Settings → Billing page. New signups can still start on
   Pay-per-use (no commitment).

4. ✅ Overage: **flat $3 / completed doc on every tier** (no hard cap — overage replaces it). See §2.
5. ✅ Seats: per-seat **add-on $10/seat (+5 docs/seat)** on Starter (≤3 users) & Team (≤10 users);
   included seats Pay-per-use 1 / Starter 1 / Team 5 / Team Ultra 10. See §2.
6. ✅ **Team Ultra** added: $159 / 10 users / 100 docs (seats+docs only — NO white-label/API). See §2.
7. ✅ Plan switching: self-serve; **upgrades immediate+prorated, downgrades at period end** (§7).
8. ✅ Prices admin-editable + per-tenant discount (% or $) via Stripe Coupons (§5a).

**Still open (my recommended default in *italics*):**
9.  Pay-per-use price per completed doc. *$9 (≈45× DocuSeal's ~$0.20 marginal).*
10. Annual plans / discount? *Offer annual at ~2 months free once monthly is stable.*
11. Re-completed quote (re-sent & signed again) — count again? *Yes, each completion is a billable event.*
12. Tax handling (Stripe Tax)? *Enable Stripe Tax later; out of v1 scope.*

## 10. Build phases (each shippable; billing requires Stripe + metering before any tier)
- **Phase 0 — Foundation:** plan catalog (`lib/billing/plans.ts`), `tenants` billing + discount columns,
  `pricing_config` + `document_completions` tables (migration), Stripe customer creation,
  `/api/webhooks/stripe` (test mode).
- **Phase 1 — Subscriptions + admin pricing:** Stripe Checkout + Customer Portal; Settings → Billing
  page (shows base/discount/net); map subscription state → `plan`/`subscription_end`; Starter & Team
  purchasable; **/admin Pricing panel** (edit base list prices → new Stripe Prices) + **per-tenant
  discount** control (% or $ → attach Stripe Coupon).
- **Phase 2 — Metering & caps:** completion ledger from the DocuSeal webhook; seat enforcement; doc-cap
  checks at send; usage display in Settings → Billing.
- **Phase 3 — Pay-per-use + nudges:** metered Stripe price + usage reporting; upgrade nudges.
- **Phase 4 — Polish:** dunning (past-due → grace), downgrade handling, annual plans, Stripe Tax.
- **Prereq throughout:** DocuSeal moved sandbox→Pro+production (real signing + per-doc cost basis).

## 11. LATER: Public API (separate initiative — user-requested, not designed here)
Goal: let other vendors integrate the UltraQuote workflow. When we take this on, design will cover:
API keys/tokens per tenant (not the current cookie-session auth), scoped permissions, versioned REST
endpoints (quotes/clients/products/send), rate limiting, webhooks out to integrators, and docs. Likely a
paid add-on or higher tier. This is its own project — flagged here so the pricing model can later carry
an "API access" line, but NOT in v1.

---

## 12. AI feature cost tracking & margin budget (added 2026-07-04)

### 12.1 What is tracked
Every AI call is recorded in the **`ai_usage` ledger** (migration 024) — tagged by tenant, quote, kind, model,
tokens, and a cost snapshot. The two metered AI features are tracked **separately**:
- **AI Draft** — Anthropic **Claude** (`claude-opus-4-8`): `draft_outline` + `draft_section` / `draft_full` calls.
- **Ask AI** — Google **Gemini** (`gemini-2.5-flash`): `write` calls.
- **Extract pricing** (Gemini) is **NOT** currently attributed to a quote (`quote_id` is null). Those calls are
  few (owner-only, occasional) and small, so they're excluded from per-quote tracking for now.

Per-quote counts are surfaced on the Quotes list (the "Show AI usage" toggle — counts only, no cost, for all
users), and platform-wide cost/usage in `/admin`.

### 12.2 Cost model & margin budget
Reference cost: **~$0.018 (1.8¢) per Claude call**.

A **full AI Draft = 1 outline call + 6 section calls = 7 Claude calls** ≈ **7 × $0.018 ≈ $0.13 per full draft**.

Target **~90% gross margin**. Worked example at a **$9 / quote** price point:
- Allowed total cost per quote = **$0.90** (10% of $9).
- Allocation:
  - **DocuSeal** (e-signature): ~**$0.20**
  - **Other fixed costs**, amortized (hosting, PDF service, Gemini / Ask AI, etc.): ~**$0.20**
  - **Claude AI-Draft budget** = $0.90 − $0.20 − $0.20 = **~$0.50 per quote**
- Claude budget ÷ per-call cost = **$0.50 ÷ $0.018 ≈ 27–30 Claude calls per quote** ≈ **~4 full drafts per quote**.

### 12.3 Policy implications
- **AI Draft (Claude) is the metered / valuable resource.** Cap it at **~27–30 Claude calls per quote** (≈ 4 full
  drafts) to hold the margin. The planned rate-limit / quota enforcement (see the abuse-prevention design) meters
  this against the `ai_usage` ledger.
- **Ask AI (Gemini) is intentionally unlimited to start** — it's cheap (~$0.30 / $2.50 per 1M tokens in/out;
  fractions of a cent per call), so no cap initially.
- Net: **Draft is more valuable than Ask.** Budget and any future limits center on **Claude draft calls**; Ask AI
  stays generous. (Prompt caching further reduces Claude input cost on rich prompts — see the AI usage/caching work.)

---

## Appendix: how this maps to what exists today
- ✅ Reuse: access resolver + grace/expired/suspended (migration 012), per-user kill switch, owner Team
  management, the DocuSeal `completed` webhook (metering hook), toast/banner system, Settings page.
- 🆕 Build: Stripe integration + webhook, billing columns + completion ledger (migrations), plan catalog,
  Settings → Billing page, seat/doc-cap enforcement, usage nudges.
- ❌ Not in v1: Unlimited tier, white-label, public API, multi-brand.
