# UltraQuote — Pricing & White-Label Feasibility Notes

*Author: Claude (Opus 4.8), 2026-06-19. Assessment of the draft pricing Claude Chat proposed, focused
on the white-label question + grounded in the actual codebase. Revisit anytime; this captures context.*

> TL;DR: "Proposal/output white-label" already exists for everyone. "Full app white-label" and "API
> access" do NOT exist and are real projects — don't put them in launch pricing. The bigger blocker is
> that **there is no billing system at all** — every tier in the draft needs Stripe + usage metering
> built first.

---

## 1. White-label — feasibility against current architecture

"White-label" conflates two very different things:

### (a) Proposal / output white-label — ✅ ALREADY DONE (all tiers)
Proposals/PDFs sent to the MSP's clients carry the **MSP's** logo + company name (sidebar, PDF first
page, running header/footer, brand font). Clients never see "UltraQuote." For an MSP tool this is the
white-label that matters, and it's live today. → It's **table stakes, not a premium gate.** Market it,
but don't reserve it for Unlimited.
Evidence: `lib/pdf/serialize.ts` (tenant logo, header/footer, brand font), `clients.logo_url` /
`tenants.logo_url`, brand-font setting (migration 015).

### (b) Full app white-label (rebrand the app itself) — ❌ NOT feasible without significant new work
Almost none of this exists:
- **Custom domain per tenant** (e.g. quotes.theirfirm.com) — none. No custom-domain handling anywhere;
  would need multi-tenant domain routing + SSL provisioning (Netlify domain APIs). Real project.
- **App-chrome rebrand** — "UltraQuote Builder" is HARDCODED in `app/(auth)/login/page.tsx` and
  `components/ui/sidebar.tsx`. Accent themes are per-USER, not per-tenant brand. Removing UltraQuote
  branding from the app UI is a build.
- **White-labeled transactional email** — auth emails send from hello@ultraquote.io (Zoho, UltraQuote
  templates); can't send as the tenant's domain today.
- **White-labeled signing** — DocuSeal signing pages/emails carry DocuSeal/UltraQuote branding;
  rebranding requires DocuSeal's higher (enterprise) tiers.
Effort: weeks-to-months + ongoing ops + cost. This is an **enterprise/agency roadmap item**, not a flip.

### (c) "Multi-brand / agency" (one account, many client brands) — ❌ not supported by data model
A tenant = ONE brand (one logo/name/tax rate). An agency running multiple client brands would need
multiple tenants or per-quote brand selection — neither exists. Would require schema + UX work.

**Recommendation:** Do NOT advertise "white-label option" (or "API access") as Unlimited-tier launch
features — they'd be selling undelivered capability. Pull both; treat as scoped future enterprise work.

---

## 2. API access (also bundled in the draft's Unlimited tier) — ❌ NOT built
The `/api/*` routes are session-internal (cookie auth), not a public API. No API keys/tokens for
external consumers, no docs, no rate limiting. A real public API is its own project. Don't promise it
at launch.

---

## 3. THE bigger blocker: no billing system exists
This is ahead of any tier debate. There is **no Stripe / payment processing**. The current
"subscription" (migration 012) is just **admin-set access dates** (a kill switch / expiry gate) — no
money moves. So **every tier in the draft requires building**:
- **Stripe (or similar) billing** — checkout, subscriptions, customer portal, webhooks, invoices.
- **Usage metering** — counting completed/signed documents per tenant per month (feasible: the DocuSeal
  webhook already fires on `completed` → we record signed status; metering builds on that).
- **Enforcement** — connect plan/limits to the existing access resolver (`lib/access/access-state.ts`)
  + write-guards.
Sequence: build billing + metering FIRST; then the tier structure is just configuration.

---

## 4. Comments on the specific draft numbers
- **Pay-per-use $9/completed doc:** value-aligned (billing on *completed*, not sent — good). DocuSeal
  Pro ≈ $20/mo + ~$0.20/completed doc, so $9 is ~45× the signature marginal cost — healthy margin.
  Reads expensive to occasional users, but the 4-docs → Starter breakeven ($29 ÷ $9 = 3.2) is clean.
- **DocuSeal must move to Pro + production key** before ANY paid signing volume (currently free
  sandbox, 10 emails/mo cap). This is a hard prerequisite and a real per-doc cost input.
- **Tiers (Starter/Team/Unlimited):** reasonable shape — per-seat Team, capacity-based Unlimited. Just
  gate Unlimited on REAL things (seats + completed-doc volume), not white-label/API.
- **In-app upgrade nudges:** good idea, but they depend on the metering system above (need live
  completed-doc counts per tenant). Build metering before the nudges.
- **Margin target (5–10×):** with DocuSeal ~$0.20/doc + Gemini cents + amortized Supabase/Netlify/
  Railway, marginal cost per doc is well under $1, so subscription tiers have ample margin; the
  constraint is fixed infra + support time, not per-doc cost.

---

## 5. Recommended path (my opinion)
1. **Build billing (Stripe) + completed-doc metering** — the true prerequisite for monetizing.
2. **Move DocuSeal to Pro + production** — required for real signing + the per-doc cost basis.
3. **Launch with what exists:** branded proposals (all tiers), seats, completed-doc volume caps.
   Keep tiers simple (e.g. Pay-per-use, Starter, Team). Skip Unlimited's white-label/API at launch.
4. **Defer "white-label app" + "public API" to a scoped enterprise/agency tier later** — price them
   high and build deliberately (custom domains, app rebrand, white-labeled email/signing, multi-brand
   data model). These are months of work, not config.
5. When monetizing, also flip the **legal docs** (ToS §5 PURCHASES, liability cap, retention) and the
   Beta/non-binding-signature language — see [[ultraquote-legal-docs-live]] (memory) post-beta list.

---

## 6. Quick feasibility scorecard (today)
| Feature in draft | Built? | Effort to deliver |
|---|---|---|
| Branded proposals/PDFs (output WL) | ✅ Yes (all tiers) | Done |
| Subscription tiers / paid plans | ❌ No billing | Build Stripe + metering (medium-large) |
| Pay-per-use (per completed doc) | ⚠️ Metering possible (webhook exists), billing not | Medium |
| Multiple seats / Team | ✅ Multi-user exists; ❌ seat *limits*/billing | Small-medium (enforce + bill) |
| Doc caps + 80% nudges | ❌ No metering | Medium (build on webhook) |
| White-label APP (custom domain, rebrand) | ❌ No | Large (enterprise roadmap) |
| Multi-brand / agency (1 acct, many brands) | ❌ No (tenant = 1 brand) | Large (schema + UX) |
| Public API access | ❌ No | Large |
