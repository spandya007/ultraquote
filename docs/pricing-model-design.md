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

## 2. Tier definitions (v1 proposal — numbers are placeholders to finalize, §9)

| | **Pay-per-use** | **Starter** | **Team** |
|---|---|---|---|
| Price | $0/mo + **$9 / completed doc** | **$29 / mo** | **$79 / mo** |
| Seats (users) | 1 (owner) | 1 | up to **5** |
| Quotes (create/send/preview/PDF) | Unlimited | Unlimited | Unlimited |
| Completed (signed) docs | Pay per doc | **10 / mo** included, then [overage or hard cap] | **50 / mo** included [or unlimited] |
| Templates, catalog, AI, dark mode, etc. | All core features | All | All |
| Support | Email | Email | Email |
| Annual option | — | [yes, ~2 months free?] | [yes] |

Notes:
- **Quotes are always unlimited** on every tier — only *completed documents* meter, since that's where
  the DocuSeal cost + delivered value sit.
- Pay-per-use is the no-commitment / trial-after-beta path. Breakeven vs Starter ≈ 3.2 docs/mo
  ($29 ÷ $9) → nudge to Starter at 4 docs/mo.
- Team breakeven is **seat/capacity-based**, not volume — upgrade trigger is "add 2nd user" or nearing
  the Starter doc cap.

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

A small **plan catalog** in code (`lib/billing/plans.ts`): price IDs, seat_limit, doc_cap, display copy
— single source of truth mapping `plan` → limits + Stripe price IDs.

## 6. Metering & enforcement
- **Meter:** in the DocuSeal webhook, when a quote transitions to `completed`, insert a
  `document_completions` row (idempotent on `quote_id`). For pay-per-use tenants, also report a Stripe
  usage record (mark `reported_to_stripe`).
- **Seat enforcement:** block inviting members beyond `seat_limit` (Starter = 1 → block 2nd user with an
  upgrade prompt; Team = 5). Hook into the existing team-invite route.
- **Doc-cap enforcement (Starter/Team):** when **sending for signature** would push the tenant over its
  monthly `doc_cap`, either [hard-block with upgrade prompt] or [allow + bill overage] (§9). Check at
  send time in `app/api/quotes/[id]/send/route.ts`.
- **Integrate with access-state:** extend `lib/access/access-state.ts` so the resolver also exposes the
  plan + limits (it already returns `ok/grace/...`). Write-guards (`requireWriteAccess`) stay; add
  seat/doc-cap as separate, friendlier checks (not a hard lockout — they prompt upgrade).
- **Past-due / failed payment:** `invoice.payment_failed` → `plan_status='past_due'`; after Stripe's
  retries exhaust → treat like the existing **grace → read-only**, reusing that machinery.

## 7. Lifecycle: upgrade / downgrade / cancel
- **Upgrade** (e.g., Starter→Team): Stripe proration; new limits apply immediately via webhook.
- **Downgrade:** apply at period end (Stripe); if over the new tier's seat/doc limits, prompt to resolve
  (e.g., remove members) — don't silently delete data.
- **Cancel:** subscription ends at period end → existing **7-day read-only grace** → then expired block
  (already built). Data retained per the privacy policy (90 days post-termination).
- **Beta → paid transition:** current tenants are `plan='beta'` (unlimited, no card). At GA, prompt
  owners to pick a plan; give a grace window before enforcing.

## 8. In-app upgrade nudges (depends on §6 metering)
- Pay-per-use: at 3 completed docs/mo → "one more and Starter is cheaper"; at 4 → "switch & save."
- Starter: on attempt to add a 2nd user → "Team adds teammates"; at ~80% of doc cap → cap warning.
- Team: at ~80% of doc cap → prompt (or "you're a heavy user — let's talk" if no Unlimited tier yet).
- Surface via the existing toast/banner system + a Settings → Billing page.

## 9. Open decisions (to iterate on — my recommended default in *italics*)
1. Starter doc cap & overage: hard cap + upgrade, or include N then $/doc overage? *Include 10/mo, soft
   cap: allow a few over with a nudge, hard-block well above.*
2. Team doc cap: a number or unlimited? *50/mo included (revisit; could be unlimited if margins allow).*
3. Team seats: how many included; overage seats billable? *5 included; no overage seats in v1.*
4. Pay-per-use price per completed doc. *$9 (≈45× DocuSeal's ~$0.20 marginal).*
5. Annual plans / discount? *Offer annual at ~2 months free once monthly is stable.*
6. Free trial vs straight beta→paid? *No separate trial — beta users get a transition window; new users
   can start on Pay-per-use (no commitment).*
7. Re-completed quote (re-sent & signed again) — count again? *Yes, each completion is a billable event.*
8. Tax handling (Stripe Tax)? *Enable Stripe Tax later; out of v1 scope.*

## 10. Build phases (each shippable; billing requires Stripe + metering before any tier)
- **Phase 0 — Foundation:** plan catalog (`lib/billing/plans.ts`), `tenants` billing columns,
  `document_completions` table (migration), Stripe customer creation, `/api/webhooks/stripe` (test mode).
- **Phase 1 — Subscriptions:** Stripe Checkout + Customer Portal; Settings → Billing page; map
  subscription state → `plan`/`subscription_end`; Starter & Team purchasable.
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

## Appendix: how this maps to what exists today
- ✅ Reuse: access resolver + grace/expired/suspended (migration 012), per-user kill switch, owner Team
  management, the DocuSeal `completed` webhook (metering hook), toast/banner system, Settings page.
- 🆕 Build: Stripe integration + webhook, billing columns + completion ledger (migrations), plan catalog,
  Settings → Billing page, seat/doc-cap enforcement, usage nudges.
- ❌ Not in v1: Unlimited tier, white-label, public API, multi-brand.
