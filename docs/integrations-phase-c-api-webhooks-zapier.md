# Integrations Phase C — Public API + Outbound Webhooks + Zapier/Make

Status: **DESIGN / not started** (2026-07-22). The "force multiplier" from
`docs/integrations-connectors-design.md` §4/§6: instead of hand-building every connector, ship one
integration surface and let customers self-serve the long tail (Pipedrive, Xero, Slack, ConnectWise,
Google Sheets, HubSpot, …) via Zapier/Make with zero bespoke work from us.

Relationship to the other phases: **Phase A (QBO) is DONE + tested** (`docs/integrations-phase-a-plan.md`);
**Phase B (native HubSpot)** was planned (`docs/integrations-phase-b-plan.md`) but this doc argues to
**defer** it — Zapier covers HubSpot too. Keep QBO native (deep invoice sync); everything else = Phase C.

---

## 0. Goal & non-goals
**Goal:** one build unlocks thousands of integrations and kills "do you integrate with X?" sales
objections. Metered as a **paid-tier lever** (pricing §11).

**Non-goals:** deep, exact, two-way sync (invoice line items, CRM deal-stage pipelines, tax authority).
Those stay **native** (QBO ✅). Phase C is the shallow-but-broad complement.

## 1. The three layers
| Layer | What | Enables |
|---|---|---|
| **C1 — Outbound webhooks** | Signed JSON POSTed on lifecycle events | "When a proposal is signed → do anything" (via Zapier's generic *Webhooks* trigger, even before a branded app) |
| **C2 — Public REST API** | `/api/v1/*` + per-tenant API keys | Read proposals/clients/products; create clients (Zapier *actions*, custom scripts) |
| **C3 — Zapier / Make app** | Branded app on top of C1+C2 | One-click, no raw-webhook config; discoverable in the Zapier catalog |

Ship in that order — C1 is the smallest build and immediately useful.

---

## 2. Layer C1 — Outbound webhooks

> **✅ BUILT** (branch `feature/webhooks-c1`, 2026-07-22). Migration `032_tenant_webhooks.sql`;
> `lib/webhooks/{events,sign,payload,store,dispatch,validate,guard}.ts` (+ `webhooks.test.ts`, 17 tests);
> emit wired at `send` (`proposal.sent`) + `docuseal` webhook (`proposal.viewed/signed/declined`);
> retry runner `POST /api/webhooks/dispatch/run` (CRON_SECRET-gated, mirrors `deletions/run`), driven by a
> **Netlify scheduled function** `netlify/functions/webhook-retry.mjs` (every 5 min); CRUD routes under
> `/api/webhooks/endpoints`; Settings → Integrations → **Webhooks** card (owner + `integrations`
> entitlement). **To deploy:** run migration 032 (dev+prod) + set `CRON_SECRET` on Netlify (Functions +
> Runtime scope) — the scheduled function then drives retries on prod. tsc + unit + `next build` green.

### 2.1 Events (v1)
Fire from **server-side** code we already control (so no DB triggers needed for v1):

| Event | Emit point (existing code) |
|---|---|
| `proposal.sent` | `app/api/quotes/[id]/send/route.ts` (sets `status='sent'`) |
| `proposal.viewed` | `app/api/webhooks/docuseal/route.ts` (maps `form.viewed`) |
| `proposal.signed` | `app/api/webhooks/docuseal/route.ts` (fully signed → `status='signed'`; same point that calls `createInvoiceOnSigned`) |
| `proposal.declined` | `app/api/webhooks/docuseal/route.ts` (`form.declined`) |

**v2 (deferred):** `client.created/updated` — clients are inserted **client-side via Supabase**, not a
server route, so emitting requires either a Postgres trigger (`pg_net`) or routing client creation
through an API. Left out of v1 to keep it server-emit-only. `proposal.created` similar (created via
`/api/quotes` — that one *is* a route, so it's a cheap add if wanted).

### 2.2 Payload (versioned)
```jsonc
{
  "id": "evt_01J...",              // unique — idempotency key for the consumer
  "type": "proposal.signed",
  "api_version": "2026-07-01",
  "created_at": "2026-07-22T18:03:00Z",
  "tenant_id": "…",
  "data": {
    "proposal": {
      "id": "…", "number": "PROP-2026-014", "title": "…", "status": "signed",
      "client": { "id": "…", "company_name": "…", "contact_email": "…" },
      "totals": { "monthly": 1200, "one_time": 3400, "currency": "USD" },
      "valid_until": "…", "signed_at": "…", "pdf_url": "…"
    }
  }
}
```
Totals resolved from the recommended (→selected→first) scenario via the existing `calcTotals`/`lineRev`/
`lineSetup` in `lib/pdf/serialize.ts` — same source the QBO invoice uses, so numbers are consistent.

### 2.3 Data model — migration `032_tenant_webhooks.sql`
```sql
-- Registered endpoints (secrets → service-role only, like tenant_integrations)
create table public.tenant_webhooks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  url          text not null,
  secret       text not null,          -- HMAC signing key, AES-256-GCM encrypted (lib/integrations/crypto.ts)
  events       text[] not null default '{}',   -- subscribed types
  enabled      boolean not null default true,
  source       text not null default 'user',   -- 'user' | 'zapier' | 'make'
  created_by   uuid,
  last_status  text, last_delivery_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- Delivery log — retries + observability. Idempotency via (webhook_id, event_id).
create table public.webhook_deliveries (
  id            uuid primary key default gen_random_uuid(),
  webhook_id    uuid not null references public.tenant_webhooks(id) on delete cascade,
  event_id      text not null,
  event_type    text not null,
  payload       jsonb not null,
  status        text not null default 'pending',   -- pending | success | failed | dead
  attempts      int not null default 0,
  response_code int, response_body text,
  next_retry_at timestamptz,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
alter table public.tenant_webhooks   enable row level security;  -- NO policies (service-role only)
alter table public.webhook_deliveries enable row level security; -- NO policies
create index webhook_deliveries_retry_idx on public.webhook_deliveries (status, next_retry_at);
```

### 2.4 Dispatcher
- **Emit:** at each event point, build the payload, look up enabled `tenant_webhooks` subscribed to the
  type, insert a `webhook_deliveries` row per endpoint, then attempt an **immediate best-effort POST**
  (short timeout, never blocks/breaks the send route or DocuSeal webhook — same swallow pattern as
  `createInvoiceOnSigned`).
- **Sign:** headers `X-SmartProps-Event`, `X-SmartProps-Delivery` (delivery id), and
  `X-SmartProps-Signature: sha256=HMAC(secret, timestamp + "." + rawBody)` + `X-SmartProps-Timestamp`.
  Consumers verify (documented). Reuse an HMAC helper (cf. `lib/integrations/oauth-state.ts`).
- **Retry:** failed/pending deliveries retried by a **scheduled runner** (`/api/webhooks/dispatch/run`,
  cron-gated) with exponential backoff (1m→5m→30m→2h→6h), max ~6 attempts → `dead`. Reuses the
  **`app/api/admin/deletions/run` + cron** pattern (Netlify functions are short-lived, so a persistent
  queue = the `webhook_deliveries` table + a cron drain). **Driver = a Netlify scheduled function**
  (`netlify/functions/webhook-retry.mjs`, `schedule: "*/5 * * * *"`) that POSTs the endpoint with
  `CRON_SECRET`. Scheduled functions run on **production deploys only** (not previews); set `CRON_SECRET`
  on the Netlify site. (Same driver can later cover the tenant-deletion purge runner, still un-cronned.)
- **Idempotency:** stable `event_id`; consumers dedupe. Re-sends of a proposal produce new events.

### 2.5 Settings UI
Under **Settings → Integrations** (existing card): "Webhooks" section — add endpoint (URL + pick events),
regenerate secret (shown once), enable/disable, delete, and a recent-deliveries health list
(status/response code, "resend"). Owner-only + `'integrations'` entitlement.

### 2.6 Quick test — no Zapier needed
**Zapier is NOT required to test C1.** C1 delivers a signed JSON POST to *any* HTTPS URL; a Zapier app is a
separate future slice. For a smoke test, point it at a free catch-all bin:

1. **Run migration `032`** on the target Supabase project (prod, since deploy previews use the prod DB).
2. Open **https://webhook.site** → copy your unique receiver URL.
3. On the live site → **Settings → Integrations → Webhooks → Add endpoint** → paste the URL, tick the
   events, save → **copy the signing secret** from the one-time popup.
4. Open a proposal → **Send for signature** → within a second, `proposal.sent` appears on webhook.site.
   Check the `X-SmartProps-*` headers + JSON body (`data.proposal.totals` should match the proposal).
5. **Verify the signature:** with the raw body + `X-SmartProps-Timestamp` header from webhook.site,
   `printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$SECRET"` must equal the
   `X-SmartProps-Signature` value after `sha256=`.
6. **DocuSeal-driven events** (`viewed`/`signed`/`declined`) only fire where DocuSeal's webhook is
   configured to call (prod, `app.smartprops.io`) — open the signing link + complete/decline to see them.
   They won't arrive on a deploy-preview URL.
7. **Retry drain:** `curl -X POST "https://app.smartprops.io/api/webhooks/dispatch/run?secret=$CRON_SECRET"`.
   For automatic retries, point an external cron (~every 5 min) at that endpoint.

---

## 3. Layer C2 — Public REST API

> **✅ BUILT** (branch `feature/api-c2`, 2026-07-22). Migration `033_tenant_api_keys.sql`
> (+ `api_rate_counters` + `api_rate_increment()`); `lib/api/{keys,scoped,ratelimit,handler,respond,serialize,openapi}.ts`
> (+ `api.test.ts`, 12 tests incl. tenant-isolation). Endpoints under `/api/v1`: `proposals` (list + `:id`),
> `clients` (GET/POST), `products` (GET), `webhooks` (POST/`:id` DELETE for Zapier), plus discovery root +
> `/api/v1/openapi.json`. Owner key management `/api/keys` + Settings → Integrations → **API keys** card.
> Shared owner+entitlement guard in `lib/access/integrations-owner.ts`. **Deferred:** `POST /proposals`
> (v2), hosted docs page. **To deploy:** run migration 033 (dev+prod). tsc + unit + `next build` green.

### 3.1 API keys — migration `033_tenant_api_keys.sql`
Hashed like `mfa_recovery_codes` (SHA-256, service-role only — `lib/auth/recovery-codes.ts` pattern):
```sql
create table public.tenant_api_keys (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  key_hash    text not null,          -- sha256(full key); full key shown ONCE
  key_prefix  text not null,          -- e.g. "sp_live_ab12" for display/identification
  scopes      text[] not null default '{read}',  -- read | write
  created_by  uuid, last_used_at timestamptz,
  created_at  timestamptz not null default now(), revoked_at timestamptz
);
alter table public.tenant_api_keys enable row level security;  -- NO policies (service-role only)
create unique index tenant_api_keys_hash_idx on public.tenant_api_keys (key_hash);
```
Key format `sp_live_<32 random>`; generated + shown once (copy/download), revocable.

### 3.2 Auth
`Authorization: Bearer sp_live_…` → SHA-256 → look up `tenant_api_keys` (not revoked) → resolve
`{ tenantId, scopes }` or **401**. Helper `authenticateApiKey(req)`. Update `last_used_at` (throttled).
⚠️ The key is **not** a Supabase auth user, so **RLS does not apply** — every query uses the
service-role client with an **explicit `.eq('tenant_id', tenantId)`**. This is the #1 correctness rule
(a missing tenant filter = cross-tenant leak); centralize it in a scoped query helper.

### 3.3 Endpoints (`/api/v1`, additive-only versioning)
| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/api/v1/proposals` | read | list; filters: `status`, `client_id`, `updated_since`; paginated |
| GET | `/api/v1/proposals/:id` | read | detail + scenarios/line items/totals/client/pdf_url |
| GET | `/api/v1/clients` | read | list |
| POST | `/api/v1/clients` | write | create (mirror the client-drawer fields + validation) |
| GET | `/api/v1/products` | read | catalog |
| POST | `/api/v1/webhooks` / DELETE `:id` | write | **for Zapier REST-hook subscribe/unsubscribe** (writes `tenant_webhooks` with `source='zapier'`) |
| POST | `/api/v1/proposals` | write | **deferred (v2)** — create a draft proposal; larger surface |

### 3.4 Rate limiting & docs
- Per-key limit (e.g. 100 req/min). ⚠️ No Redis in-stack — needs a store: a small `api_rate_counters`
  table (window bucket) or a hosted limiter (Upstash). **Open decision** (§7).
- Publish an OpenAPI spec + a short docs page (feeds the Zapier app + customer scripts).

### 3.5 Settings UI
**Settings → Integrations → API keys**: generate (name + scopes → shown once), list (prefix +
last-used), revoke. Owner-only + entitlement.

### 3.6 Quick test — verified on the deploy preview 2026-07-22
No DocuSeal/cron dependency → C2 tests fully on a **deploy preview** (which uses the prod DB, so run
migration `033` on prod first). `BASE` = the preview or prod origin; `KEY` = a generated `sp_live_…` key.

```bash
# Read
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/proposals?limit=5" | jq
curl -s -H "Authorization: Bearer $KEY" "$BASE/api/v1/proposals/<id>" | jq '.totals'   # match the app; no unit_cost/margin
# Write (needs a read/write key)
curl -s -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"company_name":"API Test Co"}' "$BASE/api/v1/clients" | jq          # 201 (writes real data — delete after)
# Auth + scope
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v1/proposals"           # 401 (no key)
# …a READ-ONLY key POSTing a client → 403 forbidden
```

**Rate limit — must use a CONCURRENT burst** (sequential curls to a remote host span >1 min and the
fixed window resets → false all-200s):
```bash
seq 1 130 | xargs -P 20 -I {} \
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/proposals" | sort | uniq -c
# ✅ verified: ~"100 200" + "30 429"
```
The limiter **fails open** if `api_rate_increment` errors — if a burst returns all 200s, confirm the
function exists: `select proname from pg_proc where proname='api_rate_increment';` (else re-run
`033_tenant_api_keys.sql`, which is idempotent). Spec is public: `$BASE/api/v1` + `$BASE/api/v1/openapi.json`.

---

## 4. Layer C3 — Zapier / Make app
Built on C1 (triggers) + C2 (actions), **Zapier Platform CLI** (JS), auth = **API Key**.
- **Triggers (REST Hooks):** *New Signed Proposal*, *New Sent Proposal*, *Proposal Declined*. Zapier's
  subscribe/unsubscribe call `POST/DELETE /api/v1/webhooks` (creates a `tenant_webhooks` row pointing at
  Zapier's target URL, `source='zapier'`). Optional polling fallback via `GET /api/v1/proposals?updated_since=`.
- **Actions:** *Create Client*, *Find Client*, (v2: *Create Proposal*).
- **Publish:** start **private/unlisted** (share an invite link) → submit for Zapier review to list
  publicly once stable.
- **Make.com:** either a custom app (same API/webhooks) or document the generic HTTP + webhook modules.

---

## 5. Security model (summary)
- API keys: SHA-256 hashed, shown once, prefixed, scoped (read/write), revocable, `last_used_at`.
- Webhooks: HMAC-signed payloads + timestamp (replay window); secrets encrypted at rest.
- **Tenant isolation without RLS:** API-key requests use service-role + mandatory explicit tenant filter
  (scoped helper). Covered by RLS/tenant tests (extend `npm run test:rls`).
- Secrets tables: RLS-enabled, **no policies** (service-role only) — same as `tenant_integrations` /
  `mfa_recovery_codes` / `platform_admins`.
- Rate limiting per key; abuse circuit-breaker.

## 6. Entitlement & pricing
Gate behind the existing **`'integrations'`** feature (or a dedicated **`'api_access'`** key) via
`plan_features` + `userHasFeature`/`tenantHasFeature` (`lib/billing/entitlements.ts`). Natural
paid-tier lever (pricing §11). Non-entitled owners see the locked upsell (same pattern as the
Integrations card).

## 7. Open decisions
1. **v1 events** — proposal lifecycle only, or add `proposal.created`/`client.created` (the latter needs
   a DB trigger since clients are created client-side)?
2. **Dispatch model** — immediate best-effort POST + retry cron (proposed) vs queue-only via cron.
3. **Rate-limit store** — `api_rate_counters` table vs Upstash vs best-effort.
4. **API write surface** — clients only (v1) vs also proposals (v2).
5. **Feature key** — reuse `'integrations'` vs new `'api_access'` (finer-grained gating/pricing).
6. **Zapier** — private/unlisted first vs straight to public review; build Make app now or later.
7. **Defer native HubSpot?** — recommended yes (Zapier covers it); revisit if a customer needs deep
   deal-stage sync.

## 8. Reuse map (what's already there)
| Need | Reuse |
|---|---|
| Encrypt webhook secrets | `lib/integrations/crypto.ts` (AES-256-GCM) |
| Hash API keys | `lib/auth/recovery-codes.ts` (SHA-256) + `mfa_recovery_codes` table pattern |
| Secrets table (RLS, no policies) | `tenant_integrations` / `platform_admins` pattern |
| Event emit points | send route + `app/api/webhooks/docuseal/route.ts` (where QBO already fires) |
| Proposal totals for payloads | `calcTotals`/`lineRev`/`lineSetup` in `lib/pdf/serialize.ts` |
| Scheduled retry runner | `app/api/admin/deletions/run` + cron pattern |
| Entitlement gating | `lib/billing/entitlements.ts` + `plan_features` |
| Settings home | Settings → Integrations card |
| HMAC signing | `lib/integrations/oauth-state.ts` helper style |

## 9. Build phases & effort
- **C1 — Webhooks** *(moderate)*: migration 032, dispatcher + HMAC, emit at send/docuseal points, retry
  cron, Settings UI. **Immediately useful via generic Zapier Webhooks** — ship this first.
- **C2 — API + keys** *(moderate–large)*: migration 033, `authenticateApiKey`, scoped query helper,
  `/api/v1` read endpoints + create-client + webhook sub/unsub, rate limiting, OpenAPI + docs, key UI.
- **C3 — Zapier app** *(separate track)*: Zapier CLI app (triggers/actions/auth), review/publish;
  Make optional. Gated on their review cadence.

~60–70% of C1/C2 leans on existing patterns (crypto, hashing, secrets tables, emit points, cron). The
genuinely new work is the dispatcher + retry semantics, the API-key auth + strict tenant scoping, and
the Zapier app (external platform).

## 10. Suggested first slice
Ship **C1 webhooks + the C2 API-key auth + `/api/v1/webhooks` sub/unsub + `GET /api/v1/proposals`** as
one milestone → a customer can already do "proposal signed → anything" through Zapier's generic Webhooks
trigger, and it validates the event model + key model before investing in the full REST surface and the
branded Zapier app.

## 11. Cost of testing / development (verified 2026-07-22 — prices shift, re-verify)
**Building + testing all of Phase C is ~$0.** Only one optional paid item.

| Piece | How to test | Cost |
|---|---|---|
| **C1 webhooks + C2 API** | `curl` / `webhook.site` / Postman | **Free** |
| **Zapier app (C3)** | **Zapier Platform** dev env — test your own app's triggers/actions | **Free** |
| Zapier *generic* "Webhooks by Zapier" trigger | (only if testing raw webhooks pre-app) | **Professional ~$19.99/mo annual / $29.99 monthly** (750 tasks). Free plan = 100 tasks / 2-step Zaps, **no Webhooks**. *Deferrable.* |
| **MCP server** dev testing | **MCP Inspector** (open-source, no account) + **Claude Desktop** | **Free** |
| MCP as a claude.ai **remote custom connector** | add the server URL as a connector | **Free plan allows 1 custom connector** — enough to test end-to-end |
| More/heavier Claude use | — | Pro ~$20/mo · Max ~$100–200/mo · Team ~$20–25/seat (Std) / ~$100–125/seat (Premium, 5-seat min) · API = pay-as-you-go (cents for testing) |

**Takeaway:** the whole build validates for free (curl + MCP Inspector + free-Claude 1-connector); the only
paid item anywhere is Zapier's generic Webhooks trigger (~$20/mo), which you can skip until validating the
branded Zapier app. Sources: Zapier pricing (nocode.mba, eesel.ai); Claude connectors/pricing
(support.claude.com, ai-toolbox.co).

---

# Appendix A — MCP server (AI-chat / agent consumption layer)

> **✅ LOCAL SERVER BUILT** (branch `feature/mcp-server`, 2026-07-23). Standalone `@smartprops/mcp` package
> in **`mcp-server/`** (own `package.json`/`tsconfig`, excluded from the root build like `pdf-service`).
> stdio transport, `@modelcontextprotocol/sdk` v1, auth via `SMARTPROPS_API_KEY` (an `sp_live_` key) over
> the C2 `/api/v1` API. **v1 tools:** `list_proposals`, `get_proposal`, `list_clients`, `find_client`,
> `list_products` (read) + `create_client` (write, with `destructiveHint:false`/`idempotentHint:false`).
> Smoke-tested: server handshakes, lists all 6 tools with correct annotations, keyless calls return a clean
> auth error. `mcp-server/README.md` has Claude Desktop + MCP Inspector setup.
>
> **✅ REMOTE SERVER — SLICE 1 BUILT** (branch `feature/mcp-remote`, 2026-07-23). `POST /api/mcp` in the Next
> app using the SDK's stateless `WebStandardStreamableHTTPServerTransport` (Web `Request`/`Response`, Fetch-
> native → Netlify-safe; verified a fresh per-request server answers initialize/tools/list/tools/call with
> no per-instance handshake). Auth = **Bearer API key** (`authenticateApiKey`) → reuses the C2 entitlement +
> per-key rate limit + **`ScopedDb`** isolation; tools defined in `lib/mcp/server.ts` call ScopedDb +
> serializers directly (no HTTP hop), same 6 tools. Usable now from **MCP Inspector / Cursor** with the key
> as a bearer token. `@modelcontextprotocol/sdk` added to the root app (external server package in
> next.config). **Deferred:** `create_proposal`/`add_line_item`/`draft_section` (need C2 write endpoints +
> `/api/ai/draft`) and the **send-safety** `prepare_send`→confirm-token flow.
>
> **✅ REMOTE SERVER — SLICE 2 (OAuth 2.1 AS) BUILT** (branch `feature/mcp-oauth`, 2026-07-23). Migration
> `034_oauth_mcp.sql` (`oauth_clients` + `oauth_authorization_codes` + `oauth_tokens`; service-role only,
> codes/tokens SHA-256 hashed). Endpoints: `/.well-known/oauth-protected-resource` +
> `/.well-known/oauth-authorization-server` (RFC 9728/8414 metadata, via next.config rewrites),
> `/api/oauth/register` (DCR, RFC 7591, public PKCE clients), `/authorize` consent page (reuses the Supabase
> session → tenant; read-always + opt-in write; open-redirect-guarded) → `/api/oauth/authorize` decision
> (issues the code), `/api/oauth/token` (auth-code exchange with **PKCE S256** verify + **refresh rotation**).
> `/api/mcp` now accepts BOTH `sp_live_` API keys and `sp_mcp_at_` OAuth access tokens (`lib/mcp/auth.ts`),
> and 401s with a `WWW-Authenticate` resource-metadata pointer so clients auto-discover the AS. `/authorize`
> + `/.well-known/*` made public in middleware; login form honors a safe `redirectTo`. Access-token TTL 1h,
> refresh 30d. PKCE verified against the RFC 7636 test vector (unit). **To deploy:** run migration 034;
> then claude.ai → Settings → Connectors → Add custom connector → `https://app.smartprops.io/api/mcp`.
> **Deferred:** token **revocation** endpoint + a Settings "Connected AI apps" management list.
>
> **✅ WRITE TOOLS BUILT + TESTED** (branch `feature/mcp-write-tools`, 2026-07-23). Shared tenant-scoped
> helpers `lib/proposals/mutations.ts` (`createProposal`/`addScenario`/`addLineItem`; child tables verify
> the parent up-chain for isolation; proposal number via a **service-role CAS** on `tenant_settings` — the
> `next_quote_number` RPC needs an `auth.uid()` member which API/MCP lacks) back BOTH the MCP tools
> `create_proposal`/`add_scenario`/`add_line_item` (all `write`-scope) AND **`POST /api/v1/proposals`** (the
> previously-deferred C2 write). `created_by` threaded from the OAuth user / API-key creator. Verified
> end-to-end (create → add catalog + free-text line items → add scenario → totals correct). **Still
> deferred:** `draft_section` (Claude writes; `/api/ai/draft` is session-gated + AI-capped) and the
> safety-gated `send_for_signature` (A.4: `prepare_send`→confirm token + separate `send` scope, off by default).

**The pitch: "build proposals by chatting with your AI."** An MCP (Model Context Protocol) server exposes
the proposal workflow as typed tools an AI can call, so a chat session in Claude / Claude Desktop /
Cursor / any MCP client can drive the whole flow: *"Create a proposal for Acme from this thread, use the
Managed Services package + a security add-on scenario, draft the exec summary in our voice, preview it."*

## A.1 Framing — a third consumption layer on the SAME C2 API
MCP is **mostly a thin, typed wrapper over the Phase C REST API** (§3) plus the existing AI-draft
endpoint. Same API investment, three clients: **Zapier** (no-code), **raw REST** (devs), **MCP**
(AI/agents). So this is **Phase C+** — sequence it after C2; do NOT build it before the API exists.

## A.2 Hosting model
| Mode | Transport | Auth | Who | Notes |
|---|---|---|---|---|
| **Remote (productized)** | Streamable HTTP MCP at `https://app.smartprops.io/api/mcp` | **OAuth 2.1** | Everyone — add as a **claude.ai connector** / Claude Desktop / Cursor by URL | Multi-tenant: OAuth maps the connecting user → their tenant. Reuse the **QBO OAuth plumbing** (authorize/callback/token, HMAC state). |
| **Local (dev / power-user)** | stdio | **Phase C API key** | Technical users running it themselves | Small `@smartprops/mcp` npm pkg started with `SMARTPROPS_API_KEY`. **Cheapest to ship first**; validates the tools before OAuth. |

Recommend **local-first** (fast, proves the tool set on the API key) → **remote/OAuth** as the
productized claude.ai-connector experience.

## A.3 Surface — tools / resources / prompts
**Tools** (JSON-schema'd; each wraps a `/api/v1` call or an existing endpoint):
| Tool | Wraps | Scope |
|---|---|---|
| `find_client`, `list_clients` | `GET /api/v1/clients` | read |
| `search_catalog`, `list_products` | `GET /api/v1/products` | read |
| `get_proposal` (state, scenarios, totals, status, pdf_url) | `GET /api/v1/proposals/:id` | read |
| `create_client` | `POST /api/v1/clients` | write |
| `create_proposal` (draft: client + title) | `POST /api/v1/proposals` (the deferred C2 write) | write |
| `add_scenario`, `add_line_item` | proposal-mutation endpoints | write |
| `draft_section` | **existing `/api/ai/draft`** (AI drafts a section, brand-voice grounded) | write |
| `preview_pdf` | `/api/quotes/[id]/preview` \| `/pdf` | read |
| ⚠️ `send_for_signature` | `/api/quotes/[id]/send` | **send** (gated — see A.4) |

**Resources** (read-only context the model can pull): active templates, the tenant's Proposal Voice,
the product catalog.
**Prompts** (optional): a guided "new proposal" prompt (intake → outline → draft), mirroring the in-app
AI-draft flow.

## A.4 ⚠️ Safety model for AI-initiated actions (the crux)
Sending a **legally-binding e-signature request** must never be a silent one-shot from an AI.
- **Scopes:** `read` / `write` / **`send`** — `send_for_signature` requires the separate **`send`** scope,
  **off by default**. Draft-and-preview works without it.
- **Two-step send:** `prepare_send` returns a human-readable summary + a short-lived confirmation token;
  `send_for_signature` requires that token. Combined with the MCP tool annotation
  **`destructiveHint: true`** (also set `readOnlyHint`/`idempotentHint` appropriately) so MCP clients
  surface a confirmation prompt.
- **AI fair-use:** `draft_section` counts against the **25-call/quote cap** (`aiDraftLimitBlock`), same as
  in-app.
- **Audit:** log every MCP tool call (tenant / key-or-user / tool / args-summary) — reuse the `ai_usage` /
  audit patterns. Surface in `/admin`.

## A.5 Auth → tenant + isolation
Remote: OAuth grant → session → tenant. Local: API key → tenant (§3.2). Either way the request is **not**
a Supabase auth user → **RLS does not apply** → every tool uses service-role + the **mandatory explicit
tenant filter** (same #1 rule as §3.2 / §5). Extend `npm run test:rls` to cover MCP paths.

## A.6 Entitlement & positioning
Gate behind the same `'integrations'` / `'api_access'` feature (§6) — a premium, AI-native lever.
Market as **"proposals by chat"** — reinforces the existing AI-drafting brand. Treat as
**differentiation + forward-bet + power-user** value; MCP adoption is early for SMB MSPs today but
climbing fast (Claude, Cursor, ChatGPT connectors).

## A.7 Reuse map (MCP-specific)
| Need | Reuse |
|---|---|
| MCP server | `@modelcontextprotocol/sdk` (TS); tools wrap `/api/v1` + `/api/ai/draft` |
| Remote OAuth | QBO OAuth pattern (`lib/integrations/qbo/oauth.ts`, `oauth-state.ts`) |
| Local auth | Phase C API keys (§3.1) |
| Send-safety | MCP tool annotations (`destructiveHint`) + a `prepare_send`→confirm token |
| AI drafting | existing `/api/ai/draft` + `aiDraftLimitBlock` cap |
| Gating | `lib/billing/entitlements.ts` |

## A.8 Open decisions (MCP)
1. **Local-first (API key, stdio) vs remote-first (OAuth, claude.ai connector)** — recommend local-first.
2. **Remote auth** — OAuth 2.1 (proper) vs API-key-over-HTTP (simpler, less native to MCP clients).
3. **v1 tool set** — read + draft only (safest) vs include create/mutate vs include gated send.
4. **Send gating mechanism** — tool annotation only, two-step token only, or both (recommend both).
5. **Distribution** — publish as a claude.ai connector + list in the MCP registry, or keep unlisted first.
6. **Overlap** — position vs the in-app AI drafting (MCP = bring-your-own-AI / cross-tool; in-app = turnkey).
