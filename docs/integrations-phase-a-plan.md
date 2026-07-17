# Integrations — Phase A Implementation Plan (framework + QBO, gated by subscription tier)

> Actionable build plan (2026-07-13). Builds on `docs/integrations-connectors-design.md` (§0 build
> phases, §2 architecture) and `docs/integrations-accounting-psa-research.md` (QBO technical notes).
> **Decisions (owner, 2026-07-13):** integrations available on **subscription plans, NOT pay-per-use**;
> availability controlled by a **Platform Admin feature×plan matrix** (admin-editable, not hardcoded).

## Context / constraint
Subscription **tiers** don't exist in the DB yet — only the subscription **window**
(`tenants.subscription_start/end`, `platform_enabled`) + the `lib/access/*` lifecycle resolver
(`ok/grace/suspended/expired/user_disabled`). The 5-tier `plan` model is design-only, pending the
(deferred) Stripe billing build. Phase A introduces a **minimal, forward-compatible slice** of that:
an admin-set `tenants.plan` + an admin-editable entitlements matrix. **No Stripe** — plan is set
manually by a Platform Admin until billing lands.

`lib/access` = access **lifecycle** (is the account live?). The new `lib/billing` = **entitlement**
(does this plan include this feature?). Separate concerns; both consulted where relevant.

---

## A1 — Tier scaffolding + admin-editable feature matrix (ship + test first)

**Migration `028_plans_and_feature_entitlements.sql`:**
- `tenants.plan` — `text not null default 'beta'`, check in
  `('beta','pay_per_use','starter','standard','pro','ultra')`. Existing rows backfill to `beta`.
- `plan_features` (the admin matrix): `plan text, feature_key text, enabled boolean not null default
  false, updated_at timestamptz default now(), updated_by uuid`, PK `(plan, feature_key)`.
  RLS enabled, **no policies** (service-role / platform-admin only, like `platform_admins`).
- Seed `feature_key='integrations'`: `enabled=true` for `starter/standard/pro/ultra` **and `beta`**;
  `false` for `pay_per_use`.

**Code:**
- `lib/billing/features.ts` — code registry of known features: `FEATURES = [{ key:'integrations',
  label:'Integrations', description:'…' }]`. Code owns *what features exist*; DB owns *which plans get
  them*. Also `PLANS` list (keys + labels) for the matrix columns / plan dropdown.
- `lib/billing/entitlements.ts` — `tenantHasFeature(tenantId, key): Promise<boolean>`. Resolves
  `tenants.plan` → `plan_features`; platform admins always true; per-request cache (mirror
  `getUserContext`). Service-role read (entitlements are platform-managed).

**Admin UI (`/admin`):**
- `components/admin/feature-entitlements-card.tsx` — grid: rows = `FEATURES`, columns = `PLANS`,
  checkboxes toggling `plan_features.enabled`. Saves via `PATCH /api/admin/feature-entitlements`
  (platform-admin guarded). `app/admin/page.tsx` fetches `plan_features` and passes it in.
- Per-tenant **Plan** dropdown in `ManageSubscriptionModal` (or tenant profile PATCH) → writes
  `tenants.plan`.

**Tests:** unit-test `tenantHasFeature` (each plan × seeded matrix; platform-admin override; unknown
feature → false).

**Exit criteria:** admin can set a tenant's plan + toggle the matrix; `tenantHasFeature` returns the
right answer. No integration code needed to verify.

---

## A2 — Integrations framework (generic)

**Migration `029_tenant_integrations.sql`:**
- `tenant_integrations` — `tenant_id, provider, status (connected|error|disconnected), auth_type,
  access_token, refresh_token, expires_at, account_ref (realmId), scopes, settings jsonb,
  connected_by, timestamps`. RLS service-role only. Tokens **encrypted at rest**.
- Linkage columns (additive, nullable): `clients.qbo_customer_id`, `quotes.qbo_invoice_id`
  (add `products.qbo_item_id`, `quotes.qbo_estimate_id` when estimates land).

**Code:**
- `lib/integrations/crypto.ts` — AES-256-GCM encrypt/decrypt with `INTEGRATIONS_ENC_KEY`.
- **Settings → Integrations** section, gated by `tenantHasFeature(tenant,'integrations')`: connector
  cards (Connect/Disconnect + status) when entitled; locked "upgrade" state otherwise.
- **Gate enforced in 3 places** (defense in depth): Settings UI, connect API route (403), sync trigger.

---

## A3 — QuickBooks Online connector ✅ BUILT (2026-07-13)

**Env (set in Netlify — All Scopes):**
- `INTEGRATIONS_ENC_KEY` — `openssl rand -base64 32` (token encryption; also signs OAuth state).
- `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` — from the Intuit developer app.
- `QBO_REDIRECT_URI` — must EXACTLY match the Redirect URI registered in the Intuit app, e.g.
  `https://app.ultraquote.io/api/integrations/qbo/callback` (and a localhost one for dev).
- `QBO_ENV` — `sandbox` (default) or `production`.

**Intuit setup:** create an app at developer.intuit.com → keys for Development (sandbox) → add the
Redirect URI(s) → scope `com.intuit.quickbooks.accounting`. Every dev account gets a pre-seeded
sandbox company.

**Files built:**
- `lib/integrations/qbo/config.ts` (env + endpoints), `oauth.ts` (code exchange / refresh / revoke),
  `client.ts` (token-refresh w/ per-tenant lock + persist newest refresh token; customer/item/invoice
  helpers), `invoice-on-signed.ts` (orchestration), `lib/integrations/oauth-state.ts` (HMAC state).
- Store token helpers (`saveConnection`/`getConnectionSecrets`/`updateConnectionTokens`/
  `deleteConnection`) with AES-GCM encryption.
- Routes: `/api/integrations/qbo/connect|callback|disconnect` (owner + entitlement gated).
- DocuSeal webhook hooks `createInvoiceOnSigned` after a quote flips to `signed` (best-effort,
  idempotent). Settings card: QBO now `available` — Connect / Disconnect + OAuth return toast.

**v1 mapping (updated 2026-07-15 — Option B):** each invoice line's **Product/Service** = a QBO Item
found-or-created per distinct product name (`line.description`, sanitized: no `:`, ≤100 chars); the
line **Description** = `line.details` (the long description), falling back to the name; amounts are the
discounted revenue. Setup fees are a separate line under the same item.

**Tax (DECIDED 2026-07-16 — defer to QBO, do NOT mirror):** UltraQuote does **not** push its
`tax_rate` onto the invoice. Each line is flagged taxable/non-taxable from the quote's per-line
`is_taxable` (QBO `TaxCodeRef` = `TAX`/`NON`, the US Automated-Sales-Tax reserved codes); **QBO computes
the actual rate** from the customer's address. Rationale: QBO is the system of record for tax/filing,
AST is more accurate than our single company-wide rate and often can't be overridden per line, and this
matches what an MSP on QBO expects. **Consequence to document for users:** the signed *proposal* total
(our estimated tax) and the QBO *invoice* total may differ by the tax amount — the proposal is the
agreed scope + pre-tax pricing; tax is a pass-through computed authoritatively at billing. Limitation:
`TAX`/`NON` assume a US/AST company; non-AST/manual-tax companies would need a real `TaxCode` id
(deferred). Also still deferred: full catalog sync (`products.qbo_item_id`), estimates, payment posting.

**Original env note:** `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENV`
(sandbox|production). Netlify: **All Scopes**.

- OAuth: `GET /api/integrations/qbo/connect` (signed `state`, owner-only + entitlement) → Intuit
  consent → `GET /api/integrations/qbo/callback` (exchange code, store realmId + encrypted tokens).
- `lib/integrations/qbo/client.ts` — refresh-on-use with mutex; **persist the newest refresh token
  every refresh** (else the auth chain revokes). `POST /api/integrations/qbo/disconnect`.
- **Invoice on signed:** in the existing DocuSeal `signed` webhook, if QBO connected + setting
  `create_invoice_on_signed` → find-or-create QBO Customer from client → create Invoice from the
  **recommended** scenario → store `quotes.qbo_invoice_id`. Idempotent (skip if set).
- Deferred within QBO: estimate-on-send, payment posting, the **AST tax** decision (mirror our tax vs
  defer to QBO) — decide at A3.

---

## Path A — QBO production go-live checklist
> Goal: let **real** MSP tenants push invoices to their **own** QuickBooks companies (not the sandbox).
> This is Intuit's lower tier — production access, NOT a public QuickBooks App Store listing (that's
> Path B: adds a fuller security assessment + possible pen test + marketing/listing review). Intuit
> changes these requirements periodically — verify the current specifics on the Intuit developer portal
> ("Go live" / "Publish your app") before starting.

### 1. Intuit developer portal
- [ ] In the app, request/enable **Production** keys (Keys & credentials → Production).
- [ ] Complete Intuit's **security/compliance questionnaire** (app assessment) — see §3 for our answers.
- [ ] Register the **production Redirect URI** under the **Production** keys tab (NOT Webhooks):
      `https://app.ultraquote.io/api/integrations/qbo/callback` (exact match).
- [ ] Provide required URLs: **privacy policy**, **terms of service**, **support/contact** (we have legal
      docs live — see [[ultraquote-legal-docs-live]]).
- [ ] Confirm scope stays `com.intuit.quickbooks.accounting`.

### 2. App env / config (Netlify — All Scopes, then redeploy)
- [ ] `QBO_ENV=production`
- [ ] `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` = the **Production** pair (not Development).
- [ ] `QBO_REDIRECT_URI` = the prod callback above (unchanged host).
- [ ] `INTEGRATIONS_ENC_KEY` unchanged (rotating it makes stored tokens undecryptable).
- [ ] Redeploy (env changes need a fresh deploy). Code already switches API base via `QBO_ENV`
      (`qboApiBase()` → `quickbooks.api.intuit.com`).

### 3. Technical requirements — mostly already met
- [x] OAuth 2.0 (connect/callback), signed `state`, owner + entitlement gated.
- [x] Tokens **encrypted at rest** (AES-256-GCM) + **refresh-token rotation** (persist newest).
- [x] **Disconnect** flow with token revoke.
- [x] Official **"Connect to QuickBooks"** button + logo (Intuit branding guidelines).
- [x] Minimal data footprint: we store only `realmId` + encrypted access/refresh tokens (per tenant) and
      `quotes.qbo_invoice_id` / `clients.qbo_customer_id`. No financial data cached.
- [ ] Questionnaire notes to have ready: encryption method + key management, who can access tokens
      (service-role only, RLS no-policies tables), retention (deleted on disconnect / tenant delete
      cascade), and incident response.

### 4. Post-switch verification (production sandbox → real, low-risk)
- [ ] Connect a **real** QuickBooks company (ideally your own / a test company) via `/settings`.
- [ ] Sign a low-stakes real quote → confirm the invoice lands in the real QBO with correct
      item/description/tax behavior (QBO computes tax).
- [ ] Verify disconnect + reconnect, and token refresh (force `expires_at` back, trigger a call).
- [ ] Watch Netlify function logs for `[qbo] …` lines.

### 5. Rollout guardrails
- [ ] Because `plan_features` gates integrations, only entitled tenants can connect — production exposure
      is controlled per-plan.
- [ ] DocuSeal is also still sandbox — move it to production keys/webhook before real client signing
      volume (separate from QBO; see CLAUDE.md).

---

## Assumed defaults (owner-confirmed 2026-07-13)
1. Single feature key `'integrations'` now; registry extensible to per-connector keys later.
2. Beta tenants keep integrations (seeded on).
3. Recommended scenario → the invoice.
4. Plan is admin-set manually until Stripe billing lands.

## Out of scope
Stripe billing/checkout, other connectors (HubSpot/Ingram/Pax8/TD SYNNEX/Zoho), estimates, payments,
phase-2 RLS hardening.

## Build/verify order
A1 (matrix + gating, testable immediately) → A2 (framework + gated Settings) → A3 (QBO sandbox OAuth →
invoice-on-signed).
