# Integrations Phase B — HubSpot CRM connector (implementation plan)

Status: **DRAFT / not started** (2026-07-17). Follows Phase A (framework + QBO, DONE + tested on
prod sandbox — see `docs/integrations-phase-a-plan.md`, `docs/integrations-connectors-design.md` §3g).

## 0. What Phase B delivers (scope)

Reuse the Phase A framework to add **HubSpot CRM** as the #2 connector. Post-integration, an entitled
tenant owner can:

1. **Connect HubSpot** (OAuth2) from Settings → Integrations, one-click consent, no secrets handled.
2. **Quote → Deal sync (outbound, the headline):**
   - On quote **Sent** → create/update a HubSpot **Deal** (stage = configured "proposal sent" stage),
     with amount + close date, associated to the client's **Company** + **Contact**.
   - On quote **Signed** → move that Deal to **Closed-Won** and sync the final amount.
   - On quote **Declined** → move the Deal to **Closed-Lost** (optional, behind a setting).
3. **Client ⇄ Company/Contact:** UltraQuote clients are found-or-created as a HubSpot Company +
   primary Contact (by domain/email/name), linked to the Deal.
4. **Disconnect** at any time (revokes + deletes the stored connection).

**Out of scope for Phase B (deferred):** inbound HubSpot→UltraQuote webhooks (contact freshness),
line-item/Product sync, HubSpot Quote objects, Private App token auth (optional stretch, §B4).

**Gating:** shares the existing single `'integrations'` feature key — HubSpot is auto-entitled wherever
QBO is. Per-connector entitlement (`integrations.hubspot`) is a later refinement, not Phase B.

---

## 1. What already exists and is reused unchanged

| Asset | Reuse |
|---|---|
| `tenant_integrations` table (migration 029) | `provider` is free text (`'hubspot'` already in the comment); `unique(tenant_id, provider)`; RLS-no-policies. **No schema change to the table.** |
| `lib/integrations/store.ts` | `saveConnection` / `getConnectionSecrets` / `updateConnectionTokens` / `deleteConnection` are all `ProviderKey`-generic. Reused as-is. |
| `lib/integrations/crypto.ts` | AES-256-GCM token encryption (`INTEGRATIONS_ENC_KEY`). Reused. |
| `lib/integrations/oauth-state.ts` | HMAC `signState`/`verifyState` (state already carries `provider`). Reused. |
| `lib/billing/entitlements.ts` (`userHasFeature`) | Owner + `'integrations'` gate. Reused. |
| `components/settings/integrations-card.tsx` | Iterates `PROVIDERS`, derives `/api/integrations/${p.key}/connect` + `/disconnect`. **HubSpot appears automatically** once added to the registry + routes exist. |

So the connector is: extend a union type, add a provider registry entry, add a config module + client +
oauth + orchestration, add three routes, add linkage columns, and wire two lifecycle hooks.

---

## 2. Steps

### B0 — Scaffolding (types, registry, migration, env)

- **`lib/integrations/providers.ts`**
  - Widen `ProviderKey = "qbo"` → `"qbo" | "hubspot"`.
  - Add the HubSpot `ProviderDef`: `category: "crm"`, `status: "coming_soon"` initially (flip to
    `"available"` at the end of B3), `logoSrc: "/logos/hubspot.svg"`, `brandColor: "#FF7A59"`,
    `monogram: "hs"`, `connectButtonSrc: "/logos/connect-hubspot.svg"` (drop official assets in
    `/public/logos`; graceful fallbacks already exist).
- **`components/settings/integrations-card.tsx`** — generalize the two QBO-hardcoded strings
  (status-message map key `qbo_error` and the disconnect `window.confirm` copy) to be provider-aware,
  or add HubSpot variants. Everything else is already generic.
- **Migration `030_hubspot_linkage.sql`** (additive, idempotent) — mirror the QBO linkage columns:
  ```sql
  alter table public.clients add column if not exists hubspot_company_id text;
  alter table public.clients add column if not exists hubspot_contact_id text;
  alter table public.quotes  add column if not exists hubspot_deal_id     text;
  ```
  Run on **dev** then **prod** (not auto-applied — same as 028/029).
- **Env** (Netlify, All Scopes — see the env-var-scopes gotcha):
  `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI`
  (`https://app.ultraquote.io/api/integrations/hubspot/callback`). `INTEGRATIONS_ENC_KEY` already set.
  Register ONE HubSpot developer app (public app) with the CRM scopes + this redirect URI.

### B1 — Config module — `lib/integrations/hubspot/config.ts`
- `isHubspotConfigured()` (client id/secret/redirect present).
- Constants: `HUBSPOT_AUTHORIZE_URL = https://app.hubspot.com/oauth/authorize`,
  `HUBSPOT_TOKEN_URL = https://api.hubapi.com/oauth/v1/token`,
  `HUBSPOT_API_BASE = https://api.hubapi.com`,
  `HUBSPOT_SCOPE = "crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write"`.
- No sandbox/prod env split like QBO — HubSpot uses one API base; a **HubSpot developer test account**
  serves as the sandbox.

### B2 — OAuth — `lib/integrations/hubspot/oauth.ts`
Mirror `qbo/oauth.ts`:
- `buildAuthorizeUrl(state)` → authorize URL with `client_id`, `scope`, `redirect_uri`, `state`.
- `exchangeCodeForTokens(code)` → POST token URL, `grant_type=authorization_code`
  (form-encoded; **client id/secret go in the body**, not Basic auth — differs from QBO).
- `refreshTokens(refreshToken)` → `grant_type=refresh_token`.
- **Token note (differs from QBO):** HubSpot access tokens expire in ~30 min (`expires_in≈1800`);
  refresh tokens are long-lived and do **not** rotate. Persist the returned refresh token anyway (cheap,
  matches the store contract). No `revoke` on disconnect is strictly needed (HubSpot has
  `DELETE /oauth/v1/refresh-tokens/{token}` — best-effort, optional).
- The account is identified by **hub/portal id**: read it from
  `GET /oauth/v1/access-tokens/{accessToken}` (`hub_id`) after exchange and store as `account_ref`.

### B3 — REST client — `lib/integrations/hubspot/client.ts`
Mirror `qbo/client.ts` (per-tenant `getValidAccessToken` with the **`refreshLocks` per-tenant
serialization + persist-newest** pattern; `REFRESH_SKEW_MS`). Then CRM v3 helpers:
- `findOrCreateCompany(tenantId, client)` — search `POST /crm/v3/objects/companies/search` by
  domain (from contact email) or exact name; else `POST /crm/v3/objects/companies`
  (props: `name`, `domain`, `phone`, `address`). Returns company id.
- `findOrCreateContact(tenantId, client)` — search by email; else create
  (`email`, `firstname`/`lastname` split, `phone`). Returns contact id.
- `upsertDeal(tenantId, { dealId?, dealname, amount, dealstage, pipeline, closedate })` — create
  (`POST /crm/v3/objects/deals`) or update (`PATCH /crm/v3/objects/deals/{dealId}`). Returns deal id.
- `associateDeal(tenantId, dealId, { companyId, contactId })` — v4 associations
  (`PUT /crm/v3/objects/deals/{dealId}/associations/default/{toType}/{toId}`), best-effort.
- Shared `hubspotFetch<T>()` wrapper (bearer token, JSON, error text slice) like `qboFetch`.

### B3 — Orchestration — `lib/integrations/hubspot/sync-deal.ts`
Two exported best-effort functions, both modeled on `createInvoiceOnSigned` (own try/catch, **never
throw to the caller**, idempotent via the stored id, skip when not connected / opted out):
- `syncDealOnSent(db, quoteId)`:
  1. Load quote (+ `hubspot_deal_id`), client, recommended scenario totals.
  2. Skip if HubSpot not connected (`getConnectionSecrets(tenant,'hubspot')`) or
     `settings.sync_deals === false`.
  3. Resolve company + contact ids (find-or-create, persist to `clients.hubspot_*`).
  4. Compute **amount** = one-time total + (monthly recurring × 12) [= annual contract value;
     document this choice, make the multiplier a constant]. Reuse the recommended→selected→first
     scenario resolution + `calcTotals`/`lineRev`/`lineSetup` from `lib/pdf/serialize.ts`.
  5. `upsertDeal` with `dealstage = settings.sent_stage ?? DEFAULT_SENT_STAGE`,
     `pipeline = settings.pipeline ?? 'default'`, `closedate = quote.valid_until`.
  6. Associate deal↔company↔contact; persist `quotes.hubspot_deal_id`.
- `syncDealOnSigned(db, quoteId)`:
  - If `hubspot_deal_id` set → `upsertDeal({dealId, dealstage: settings.won_stage ?? 'closedwon',
    amount: <final recommended-scenario amount>})`. If no deal id yet (quote signed without a prior
    send push), create it first, then close-won.
- (optional) `syncDealOnDeclined(db, quoteId)` → stage `settings.lost_stage ?? 'closedlost'`.

### B3 — Lifecycle hooks (2 wiring points)
- **On send** — `app/api/quotes/[id]/send/route.ts`, immediately after the existing
  `db.from("quotes").update({ status: "sent", sent_at })` (~line 194): call
  `await syncDealOnSent(db, params.id)`. Best-effort/swallowed so a HubSpot hiccup can't fail the Send.
- **On signed** — `app/api/webhooks/docuseal/route.ts`, right after the existing
  `await createInvoiceOnSigned(db, quoteId)` (~line 114): call `await syncDealOnSigned(db, quoteId)`.
- **On declined** (optional) — near line 94 where the quote is set `declined`: call
  `syncDealOnDeclined(db, quoteId)`.

### B1 — Routes — `app/api/integrations/hubspot/{connect,callback,disconnect}/route.ts`
Mirror the QBO routes exactly (owner + `'integrations'` entitlement gate; signed state with
`provider:'hubspot'`; callback re-auths the session user against the state, exchanges the code, reads
`hub_id`, `saveConnection(...)`). `disconnect` → best-effort revoke + `deleteConnection`.

### B-final — Flip HubSpot `status` to `"available"` in the registry.

---

## 3. The real design decisions (flag before coding)

1. **⭐ Deal stage IDs are tenant-specific.** HubSpot pipeline/stage internal ids vary per portal
   (custom pipelines). Hardcoding `"contractsent"` will fail on customized portals. **Recommended:**
   store `pipeline` + `sent_stage`/`won_stage`/`lost_stage` in `tenant_integrations.settings`, default
   to the standard `default` pipeline stages (`presentationscheduled`/`contractsent` → `closedwon` →
   `closedlost`), and **fall back gracefully** (if the configured/default stage is rejected, create the
   deal without a stage rather than failing). A small Settings sub-form to pick the pipeline/stages
   (fetched via `GET /crm/v3/pipelines/deals`) is the clean answer — scope as B3.5 or a fast-follow.
2. **Deal amount definition.** MSP quotes mix one-time + MRR; a HubSpot Deal has one `amount`.
   Recommended: **ACV = one-time + monthly×12**, documented on the deal (or in a note). Confirm with
   owner; make the multiplier a constant.
3. **Deal timing.** Design says create on **Send** (so it exists during the sent stage). Confirmed —
   hook at send, advance at signed. (QBO only fires at signed; HubSpot fires at both.)
4. **Company match key.** Domain (from contact email) is HubSpot's canonical company key; fall back to
   exact name. Confirm we're comfortable auto-creating companies.
5. **Private App token path (§B4)** — offer paste-a-token as an alt to OAuth? Simpler for single
   accounts but per-account. Recommend **defer** (OAuth-only for B).

---

## 4. Tests & verification (per CLAUDE.md checklist)

- **Unit (vitest):** pure helpers only, following `crypto.test.ts`/entitlements pattern —
  `buildAuthorizeUrl` shape, deal-amount (ACV) computation, stage-mapping/defaults, company/contact
  payload builders (mock fetch). No live HubSpot in unit tests.
- `npx tsc --noEmit`, `npm run test`, `npx next build` green before commit.
- **Manual sandbox checklist** — new `docs/hubspot-sandbox-test-checklist.md` mirroring
  `docs/qbo-sandbox-test-checklist.md`: §1 connect, §2 entitlement gating, §3 deal-on-send (+company/
  contact association), §4 deal→closed-won on signed, §5 idempotency (re-send updates same deal, no
  dupes), §6 token refresh (access token expiry → auto-refresh), §7 disconnect/reconnect,
  §8 declined→closed-lost (if built). Use a **HubSpot developer test account** as the sandbox.

## 5. Suggested commit slices (branch `feature/integrations-hubspot`)

1. B0 — types + registry (coming_soon) + migration 030 + config + env docs.
2. B1 — oauth + connect/callback/disconnect routes + Settings card generalization + logo assets.
3. B2/B3 — client (company/contact/deal + associations) + sync-deal orchestration + unit tests.
4. B3 — hooks in send route + docuseal webhook; flip provider to `available`.
5. Docs — help content + sandbox checklist; update this plan + the Phase-A memory.

## 6. Effort estimate
Roughly **60–70% of the code is a mechanical mirror** of the QBO connector (framework, store, oauth
shape, routes, refresh-lock). The genuinely new work is the CRM v3 client (companies/contacts/deals +
associations), the deal-stage configuration story (decision #1), and the amount definition. The two
lifecycle hooks are ~2 lines each.

## 7. Go-live (beyond sandbox)
- Move the HubSpot developer app from test account → production; complete HubSpot app review if
  listing publicly (not required for private OAuth installs the owner authorizes).
- Register the prod redirect URI; set the 3 env vars on Netlify (All Scopes).
- Deferred within HubSpot: inbound webhooks (contact freshness), Product/line-item sync, HubSpot Quote
  objects, Private App token auth.
