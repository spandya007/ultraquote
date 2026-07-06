# Self-Serve Onboarding (Pay-Per-Use) — Design

Status: **design / not built** (2026-07-06). Companion to `tenant-onboarding-design.md`
(the existing **invite-first**, admin-driven flow) and `pricing-model-design.md` §13
(AI-cost control; why pay-per-use metering is per-quote, not per-tenant).

## 1. Why this exists
Today, onboarding is **admin-first**: a Platform Admin invites a tenant → a shell tenant
is provisioned → the owner sets a password (`/admin` → invite → `/auth/set-password`).
That's fine for hand-picked MSP customers, but it doesn't scale to **self-serve
pay-per-use** signups, where a customer should be able to sign up and start using the app
without a human in the loop.

This doc adds a **self-serve signup** path that **auto-provisions an isolated tenant per
customer**. It does NOT change the invite-first path (both coexist).

## 2. The model decision (settled)
- **One tenant = one paying customer.** Each self-serve customer gets their **own** tenant
  (owner + quotes + clients + products), RLS-isolated — exactly like existing tenants, just
  created by the customer instead of an admin.
- **NOT a shared "generic tenant."** The app's RLS is tenant-scoped and reads are
  tenant-wide, so many customers in one tenant would see each other's data. Non-starter.
- **NOT an Organization.** Orgs are a **white-label / reseller** grouping (an Org Admin
  overseeing many sub-workspaces). A direct pay-per-use customer has no reseller above them,
  so an Org would only add an unused Org-Admin layer. The **Platform Admin** already oversees
  all tenants. → Orgs stay reserved for resellers/franchises (see §8).

So the data model needs **no new entity** — just a self-serve way to run the provisioning we
already do manually.

## 3. What we build on (existing foundation)
- **`provision_tenant(p_name, p_email, p_owner_id, p_owner_email, p_owner_name)`** (schema.sql /
  migration 007) — creates the tenant, the **owner** `public.users` row, and seeds default
  product categories; returns the new tenant id. This is the exact call we automate.
- **`provision_tenant_shell(p_name, p_email)`** — ownerless shell used by the invite-first
  flow. Self-serve uses `provision_tenant` instead (owner is known at signup).
- **`handle_new_auth_user()` trigger** — on auth-user insert it creates a `public.users` row
  **only if** `raw_user_meta_data.tenant_id` is set. ⚠️ Design consequence in §5.
- **Auth + password policy** (`lib/auth/password.ts`), the **`/auth/set-password`** landing,
  **middleware** marketing/public-route allowlist (`/beta`, `/login`, …), and the **`/beta`**
  public page + `beta_signups` capture (a lead form today — self-serve is the "and actually
  create the account" evolution).
- **Access lifecycle** (migration 012): subscription window, `platform_enabled`, `users.enabled`
  — the gates a new self-serve tenant slots into.

## 4. The flow (Flow S — self-serve signup)
1. **Public `/signup` page** (allowlisted in middleware). Collects: work email, company name,
   full name, password (validated by the existing policy). For pay-per-use, optionally a Stripe
   card step (§7).
2. **`POST /api/auth/signup`** (public route, service-role):
   a. Validate input + password policy; reject if the email already has an account.
   b. **Create the Auth user** (service-role `auth.admin.createUser`) **without** a `tenant_id`
      in metadata (the tenant doesn't exist yet — see §5), `email_confirm` per §6.
   c. **`provision_tenant(company, email, newUserId, email, fullName)`** → creates the tenant +
      owner `users` row + seeds categories.
   d. Optionally stamp subscription/trial fields (migration 012) — e.g. a trial window or
      pay-per-use flag.
3. **Email verification** (§6) → user confirms → **lands in their own workspace** (the normal
   dashboard, already tenant-scoped by RLS).

Net new surface: **`/signup` page + `/api/auth/signup` route.** Everything downstream (dashboard,
RLS, Settings, quoting) already works because it's just another tenant.

## 5. Key technical notes / gotchas
- **Trigger vs. provisioning (chicken-and-egg):** because `handle_new_auth_user` only inserts a
  `users` row when `tenant_id` metadata is present, create the Auth user **without** `tenant_id`
  (trigger no-ops), **then** call `provision_tenant`, which creates the owner `users` row itself.
  (Alternative: `provision_tenant_shell` first, then create the user *with* `tenant_id` metadata
  so the trigger makes the row — but `provision_tenant` already does both, so it's simpler.)
- **Service-role only:** provisioning touches RLS-locked tables → run in the API route via the
  service-role client (never client-side).
- **Duplicate email:** check before creating; return a friendly "account exists — sign in / reset
  password" instead of a 500.
- **Failure cleanup:** if `provision_tenant` fails after the Auth user is created, delete the
  orphan Auth user (mirror the invite flow's cleanup of failed shells).
- **Tenant naming:** default the tenant name to the company name; make it editable later in
  Settings (Company Name is platform-managed via trigger `013` — decide whether self-serve owners
  may edit their own, since there's no admin who set it).

## 6. Abuse / verification gating (ties to pricing §13)
Self-serve = anyone can create a tenant, so guard against throwaway accounts running up AI cost:
- **Require email verification** before the workspace (and especially AI Draft) is usable —
  Supabase email confirmation; block or read-only until confirmed.
- **Bound never-signs AI cost:** a **free trial / small free AI allowance** (e.g. a few full
  drafts) and/or a **card on file** at signup, so a signup can't burn Claude cost with zero
  commitment. This is the concrete hook for §13's "cost accrues on drafts, revenue on signs."
- **Signup rate-limiting / CAPTCHA** on `/api/auth/signup` to stop scripted mass-signups.
- Reuse the **access gate** (migration 012) to suspend/expire trials cleanly.

## 7. Billing (separable — don't let it block onboarding)
- **Onboarding (create tenant)** and **billing (charge)** are independent. Self-serve
  provisioning can ship before Stripe; gate with trial + card-on-file until metering exists.
- **Pay-per-use billing** = Stripe, metered on the **signed document** (the existing DocuSeal
  `completed` webhook is the metering hook — see pricing §3/§6). The **tenant is the billing
  entity** even for pay-per-use.
- **AI-cost control** stays **per-quote** (pricing §13), independent of tenant structure — so it
  works identically for self-serve tenants.

## 8. When to use the Org model instead (not here)
Reserve **Organizations** for **resellers / franchises / agencies**: one entity signs up and
manages **many** customer workspaces under its brand, with Org Admins, org-default brand voice,
dossiers, and workspace suspend. A direct pay-per-use customer is a **lone tenant**, no Org.

## 9. Out of scope (future)
- Team invites within a self-serve tenant already work (Settings → Team) once the owner exists.
- Plan selection / upgrade UI, Stripe checkout, dunning — the billing project.
- Custom domain / white-label for self-serve — not v1.

## 10. Open decisions
1. **New `/signup` page**, or evolve **`/beta`** (lead capture) into real account creation?
2. **Email verification**: hard-gate the workspace until confirmed, or allow limited use first?
3. **Card at signup** (pay-per-use) vs **free trial first, card later**?
4. **Free AI allowance** for a new tenant (how many full drafts before a card/limit)?
5. **Self-serve owners editing Company Name/Email** — allow (no admin set them) or keep the
   platform-managed lock from migration 013?
