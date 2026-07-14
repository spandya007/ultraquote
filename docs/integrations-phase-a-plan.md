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

## A3 — QuickBooks Online connector

**Env:** `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENV` (sandbox|production).
Netlify: **All Scopes**.

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
