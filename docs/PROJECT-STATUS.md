# UltraQuote — Project Status / Handoff Snapshot

> Snapshot 2026-06-28. Quick orientation for picking the project back up (e.g. in a new session). The
> repo on `main` (GitHub `spandya007/ultraquote`) is the source of truth — everything below is pushed.
> Also read `CLAUDE.md` (project context) and `docs/platform-admin-guide.md` (operator reference).

## Live on prod (merged to `main`, auto-deployed via Netlify)
- **App** at `https://app.ultraquote.io`; **marketing site** at `https://ultraquote.io` (separate Netlify
  static site, `marketing-site/`, with favicon + mobile-fixed).
- **Beta-signup pipeline:** public `/beta` page → `beta_signups` (migration 017) → email to
  `hello@ultraquote.io` (Zoho SMTP) → `/admin` Beta signups view (+ "Send test email" diagnostic).
- **Dashboard date-range slider** (filters all quote metrics live).
- **Tenant deletion** (PR #6): `/admin/tenants/[id]` dossier + downloadable report; **scheduled deletion**
  (30-day grace) + cancel + delete-now (purge: storage + tenant row cascade + Auth logins); owner warning
  banner; owner "Your workspace" card. Migration 018 run on dev+prod.
- **Tests:** Phase 1 unit (Vitest, 45), Phase 2 RLS (22), Phase 3 E2E (Playwright) — all in CI
  (`.github/workflows/` ci/rls/playwright). `npm run test` / `test:rls` / `test:e2e`. E2E + RLS need
  local Supabase (`colima start` + `supabase start`).
- Earlier: legal docs + accept-gate (016), Product Categories, BlockNote 0.51, per-tenant font (015),
  subscription/access lifecycle (012–013), DocuSeal e-sign, PDF service, AI writing, MFA, dark mode.

## Designed but NOT built (docs/ — ready to implement)
- **`integrations-connectors-design.md`** — MSP connectors. Priority: QBO → HubSpot → Ingram Micro →
  Pax8 → TD SYNNEX → Zoho → public API/Zapier. Amazon Business = *search-to-quote* model only (gated
  partner program). Includes the vendor line-item snapshot/freeze/refresh rules.
- **`organizations-white-label-design.md`** — new **Organization** layer + **Org Admin** role (white-label
  to MSP brands). Nomenclature: **Workspace = the `tenants` entity**, **Owner = the person**, Org Admin =
  new role. Includes Mermaid diagram + migration runbook for existing users. Additive (nullable
  `organization_id`), reuses the platform-admin service-role console pattern.
- **`pricing-model-design.md`** — FROZEN: Pay-per-use $9/doc · Starter $29 · Team $79 · Team Ultra $159;
  meter completed (signed) docs; admin-editable prices + per-tenant discounts. **No billing built yet.**
- **`tenant-deletion-design.md`** — open follow-ups: automate the purge runner (cron;
  `/api/admin/deletions/run` + `CRON_SECRET` ready), storage purge only covers tenant-logos, grace 30 vs
  90 days, audit log, "Download my data" export (backlog).

## Recommended next builds (highest leverage)
1. **Stripe billing — Phase 0** (the frozen pricing model). Design it **org-aware from the start** (a
   `billing_account` = Workspace *or* Organization) so the white-label layer doesn't need a retrofit.
2. **Integrations** — start with **QBO** (quote→invoice) + **HubSpot** (client/deal sync). Big ROI.
3. **Organizations / white-label** hierarchy (Org Admin) — needed to resell to MSP brands (CMIT, TeamLogic).
4. Smaller: automate the deletion runner cron; tenant data-export; ToS/Privacy (`feature/legal-docs`).

## Open branches
- `feature/legal-docs` (pushed) — ToS/Privacy, pending legal review. See its README checklist.

## Key operational facts
- **Migrations are manual** (`supabase/migrations/NNN_*.sql`) — run in Supabase SQL editor **dev then
  prod**. Prod project `pibipcdkxtldjbrsdbua`; dev is separate.
- **Deploys auto** on push to `main` (app + marketing site). Netlify env vars must be **All Scopes** or
  API routes see them empty. Env-var changes need a fresh deploy.
- **Email:** `hello@ultraquote.io` via Zoho SMTP; domains SPF/DKIM/DMARC authenticated.
- **Web research preference:** default to built-in WebSearch; Firecrawl only as fallback.
- Tooling: `gh` CLI installed + authed; design-doc previews render Mermaid on GitHub.
