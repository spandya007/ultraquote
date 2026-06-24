# Tenant deletion flow — design

Goal: let a platform admin permanently delete a tenant and ALL its data, safely —
**review & notify first, destroy second.** Built in phases.

## Phase 1 — Pre-deletion dossier + report  ✅ DONE
So the admin (and the tenant) can see what would be lost before anything is deleted.

- **`lib/admin/tenant-dossier.ts` — `getTenantDossier(tenantId)`** (service-role): returns counts for
  everything in the tenant's workspace + itemized lists for the **risk-flagged** items only — signed
  quotes (executed contracts), in-flight quotes (sent/viewed, awaiting signature), open signature
  sessions, and active catalog products. Per-quote value = recommended-scenario line-item subtotal.
  Effective quote status uses `effectiveStatus` (derived `expired`). Best-effort storage count (the
  tenant's `proposal-assets/tenant-logos/<id>` folder).
- **`/admin/tenants/[id]`** (`components/admin/tenant-dossier-view.tsx`): summary header, risk banner,
  workspace-contents stat grid, flagged tables (signed / in-flight quotes, active products), and a
  "what a deletion would remove" manifest (row counts per table + Auth logins + storage). Linked from
  the `/admin` tenants table ("Details").
- **`/admin/tenants/[id]/report`** (route handler, platform-admin guarded): a print-ready, branded,
  self-contained HTML report mirroring the dossier. Admin saves/prints to PDF and emails it to the
  owner so they can export/act. (Delivery chosen: downloadable report; no auto-email, no CSV.)
- **Owner self-view**: `components/settings/workspace-summary-card.tsx` — a lighter "Your workspace"
  card in Settings (owner-only), reusing the same dossier so owners know what they have.
- E2E: `tests/e2e/tenant-dossier.spec.ts` (admin dossier + report + owner self-view). The seeded E2E
  owner is also a platform admin (global-setup) to exercise `/admin`.

## Phase 2 — The delete action  ✅ DONE (scheduled, grace period, admin-only)
Decisions: **scheduled deletion with a grace period** (`DELETION_GRACE_DAYS = 30` in
`lib/admin/purge-tenant.ts` — privacy policy mentions 90, revisit), **platform-admin only**. The
workspace stays usable during the grace window so the owner can export.

- **Migration 018**: `tenants.deletion_scheduled_at` + `deletion_requested_by` + `deletion_reason`.
- **Danger zone** (`components/admin/tenant-danger-zone.tsx`) at the bottom of the dossier page:
  type-the-name-to-confirm → **Schedule deletion** (sets date = now + grace); when scheduled, shows
  the date + **Cancel** + **Delete now** (immediate override). API: `schedule-deletion` route
  (POST set / DELETE cancel), `purge` route (immediate). All platform-admin guarded.
- **Owner warning**: `components/account/deletion-banner.tsx` in the dashboard layout when
  `tenant.deletion_scheduled_at` is set.
- **The purge** (`lib/admin/purge-tenant.ts purgeTenant()`): remove Storage `tenant-logos/<id>` →
  delete the `tenants` row (cascades all child tables incl. `public.users`) → delete the members'
  Auth logins via `admin.auth.admin.deleteUser`. `listDueTenantIds()` finds tenants past their date.
- **Runner**: `POST /api/admin/deletions/run` purges all due tenants — callable by a platform admin
  OR with the `CRON_SECRET` (header `x-cron-secret` or `?secret=`).
- **E2E**: `tests/e2e/tenant-deletion.spec.ts` — schedule → owner sees banner → purge → dossier 404s
  (uses a throwaway "E2E Purge Target" tenant seeded for this).

### Still open
- **Automate the runner**: a Netlify scheduled function (or external cron) that POSTs
  `/api/admin/deletions/run` with `CRON_SECRET` daily. Until then, due deletions need a manual trigger.
- **Storage**: only `tenant-logos/<id>` is enumerated; proposal images under per-quote paths aren't
  removed (DB refs go, but the blobs may orphan). Improve if storage cost matters.
- Confirm grace = 30 vs 90 days (privacy policy alignment). Audit log of who deleted what.

### Original Phase 2 design notes (for reference)
Lives at the bottom of the dossier page, gated behind reviewing it.

- **Cascade chain (verify before building):** most children cascade via `on delete cascade` from
  `tenants` → clients, products (+ pricing_tiers, categories, product_audit), templates, quotes
  (+ scenarios, line_items, signers, signature_sessions), tenant_settings, tenant_invites. CONFIRM each
  FK actually cascades (some are `on delete set null`, e.g. quotes.created_by, products.source_quote_id).
- **NOT FK-cascaded — handle explicitly:**
  - **Supabase Auth users** (`auth.users`) for every member — delete via the GoTrue admin API
    (the `public.users` rows cascade, but the auth logins do not).
  - **Storage** objects in `proposal-assets` (tenant logos + proposal images) — enumerate + remove.
  - `platform_admins` row if the owner happens to be one (edge case).
  - `mfa_recovery_codes` for the members (keyed by user; confirm cascade vs manual).
- **Order:** purge storage + auth users first (need the ids), then delete the `tenants` row (children
  cascade). Wrap DB work so a partial failure is recoverable/idempotent.
- **Guarding:** platform-admin only; an explicit confirm (type the tenant name) + the existing
  arm/confirm pattern; ideally require that the report was generated / owner notified. Consider a soft
  "scheduled deletion" (mark + delete after N days) vs immediate hard delete — decision pending.
- **Audit:** record who deleted what + when (the tenant row is gone, so log to a separate place).
- **Test:** add a Playwright test that seeds a throwaway tenant, deletes it, and asserts all rows +
  auth users are gone.

Open decisions for Phase 2: immediate hard-delete vs scheduled/grace; self-serve owner-initiated
deletion vs admin-only; retention window per the privacy policy (90 days post-termination).
