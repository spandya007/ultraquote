# Testing

## Running
- `npm test` — run the unit suite once (Vitest).
- `npm run test:watch` — watch mode while developing.
- `npm run type-check` — `tsc --noEmit` (also part of CI).

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `type-check` + `npm test` on every
PR and on push to `main`. It runs on GitHub's runners — **independent of Netlify** (no deploy, no
build minutes consumed).

## Phase 1 (done): unit tests for pure business logic
Co-located as `*.test.ts` next to the code in `lib/`. Vitest config: [vitest.config.ts](../vitest.config.ts)
(node environment, `@/` path alias mirrors tsconfig).

Covered so far:
- `lib/access/subscription.test.ts` — `computeEndDate` (term math + month overflow), `subscriptionStatus` (active/expiring/grace/expired/suspended/unlimited boundaries).
- `lib/quote-status.test.ts` — `effectiveStatus` (derived expiry), `isStaleDraft`.
- `lib/auth/password.test.ts` — `validatePassword` / `checkPassword` policy rules.
- `lib/import/csv-products.test.ts` — `parseCsvText` (aliases, grouping→tiers, multi-line quoted fields, error cases).

Tip: date-dependent logic uses `vi.useFakeTimers()` + `vi.setSystemTime(...)` so tests are deterministic.

### Good next unit targets (same pattern)
- `lib/pdf/serialize.ts` — `calcTotals` and the discount (% vs $) + setup-fee + tax math (highest-value: silent money bugs). Consider snapshot tests for the HTML serializer.
- `lib/access/access-state.ts` — extract the input→state precedence into a pure function and test the five-state resolution without the DB.

## Phase 2 (done): RLS / multi-tenant security
Runs against a **local Supabase** stack (Docker via Colima) — never cloud dev/prod.

**One-time setup**
- `brew install colima docker supabase/tap/supabase` (already done) → `colima start`
- `supabase start` (boots local Postgres/Auth/etc. on `127.0.0.1:54321/54322`)
- Local config notes (`supabase/config.toml`): **`[db.migrations] enabled = false`** (this repo's
  001–013 are deltas on top of `schema.sql`, not a from-scratch sequence) and **`[analytics]
  enabled = false`** (its vector container can't bind-mount the Docker socket under Colima).

**Run**
- `npm run test:rls` — rebuilds the local DB (`scripts/test-db-reset.mjs`: `schema.sql` + `012` + `013`
  + `supabase/seed-test.sql`) then runs `vitest --config vitest.rls.config.ts`.
- Kept separate from `npm test` / CI so the unit suite stays DB-free.

**How it works**: `tests/rls/helpers.ts` connects with `pg`, runs each test in a rolled-back
transaction, and switches role via `set local role` + `request.jwt.claims` so `auth.uid()` behaves
exactly like PostgREST. `tests/rls/fixtures.ts` holds the seeded tenant/user UUIDs.

**Covered** (`tests/rls/`, 22 tests):
- **Tenant isolation** — clients, quotes, products, templates (a tenant only sees its own rows).
- **WITH CHECK** — a member can't insert clients/quotes into another tenant.
- **Creator-or-owner write** — quotes & templates: a member edits their own, not a teammate's; the
  tenant owner edits any; read is tenant-wide.
- **Owner-only write** — products (insert/update) and tenant settings: members are blocked.
- **`protect_tenant_admin_fields` trigger** (013) — tenant user can't change Company Name; service role can.
- **`tenant_can_read/write` + `user_can_read/write`** (012) — unlimited / grace / expired / suspended /
  disabled-user.

**CI**: [.github/workflows/rls.yml](../.github/workflows/rls.yml) boots a local Supabase stack on the
GitHub runner (Docker — no Colima needed there) and runs `npm run test:rls` on PRs + pushes to `main`
that touch DB/RLS-relevant paths (`supabase/**`, `tests/rls/**`, `lib/access/**`, etc.), plus manual
dispatch. Kept separate from the fast unit CI (`ci.yml`), which stays DB-free. It's slower (pulls
Supabase images); if Actions minutes get tight, narrow the path filter or trim services with
`supabase start -x …`.

## Phase 3 (done): E2E smoke (Playwright)
Drives the real app in Chromium against the **local Supabase** stack (same Colima/Docker stack as the
RLS tests). Config: [playwright.config.ts](../playwright.config.ts); specs in `tests/e2e/`.

**Run**
- `npm run test:e2e` — boots `next dev` (via Playwright's `webServer`) against local Supabase and runs
  the suite. `npm run test:e2e:ui` for the interactive runner.
- Prereqs: `colima start` + `supabase start` (same as Phase 2). The Supabase env (URL + keys) is injected
  by `playwright.config.ts` so it overrides `.env.local` (which points at cloud dev).

**How it works**
- `tests/e2e/global-setup.ts` rebuilds the local DB to match prod schema (`schema.sql` + migrations
  012/013/015/016/017 — **014 is skipped**, its policy is already folded into `schema.sql`), applies
  `tests/e2e/seed-e2e.sql` (two tenants, a catalog product, a client), then creates real Supabase **Auth**
  owners via the GoTrue admin API (so they have passwords) and stamps `legal_accepted_at` so they clear
  the dashboard gates. Uses `fetch` for the admin API (not supabase-js — its realtime client needs a
  WebSocket global absent on Node < 22).
- `tests/e2e/config.ts` holds the local Supabase keys (Supabase's well-known **default local-dev** keys —
  not secrets, only work against 127.0.0.1) and the seeded tenant/user fixtures.

**Covered** (`tests/e2e/`, 6 tests):
- **auth** — unauthenticated → `/login`; owner logs in → dashboard ("Hello, …"); bad password → error.
- **quote authoring** — New Quote (seeded client) → editor → add a catalog product → its price flows into
  totals → Preview opens. (Create response is captured + navigated directly; the modal's client-side push
  is flaky under the dev server.)
- **access gate** — an expired tenant's owner is redirected to `/account/suspended` (dashboard and a
  direct `/quotes` hit).

No external mocks needed: this flow never calls Gemini/DocuSeal/Railway-PDF/email (Preview uses the
internal serializer).

**CI**: [.github/workflows/playwright.yml](../.github/workflows/playwright.yml) boots a local Supabase
stack on the GitHub runner (Docker — no Colima), installs Chromium, and runs `npm run test:e2e` on PRs +
pushes to `main` touching app/flow paths (`app/**`, `components/**`, `lib/**`, `middleware.ts`,
`supabase/**`, `tests/e2e/**`, …), plus manual dispatch. In CI (`process.env.CI`), Playwright starts its
own `next dev` webServer (no reuse) and retries once; the HTML report is uploaded as an artifact on
failure. Slowest of the three workflows (Supabase images + a browser + a dev server) — kept separate from
`ci.yml` (unit, DB-free) and `rls.yml`.

## Deliberately manual (flaky/expensive to automate)
BlockNote editor internals, PDF visual fidelity, DocuSeal webhook round-trips, real email. Use a
pre-deploy smoke checklist (e.g. `docs/subscription-access-test-plan.md`) instead.
