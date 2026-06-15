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

## Phases not yet built (see the test-automation plan)
- **Phase 2 — RLS / multi-tenant security** against Supabase local (or a dedicated test project): tenant isolation, creator-or-owner edit, `tenant_can_read/write` + `user_can_read/write`, the `protect_tenant_admin_fields` trigger, member disable.
- **Phase 3 — E2E smoke** (Playwright): login → create quote → add line item → Preview; plus an access-gate flow (expired tenant → blocked). Mock external services (Gemini, DocuSeal, Railway PDF, email).

## Deliberately manual (flaky/expensive to automate)
BlockNote editor internals, PDF visual fidelity, DocuSeal webhook round-trips, real email. Use a
pre-deploy smoke checklist (e.g. `docs/subscription-access-test-plan.md`) instead.
