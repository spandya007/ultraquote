# UltraQuote — Platform Admin Guide

> Operator reference for the **Platform Admin** (Sameer). Living doc — add to it as functions ship.
> The Platform Admin runs the whole platform: onboarding tenants, subscriptions/access, beta, deletions,
> and the operational plumbing (migrations, deploys, env, email). This is **not** the in-app Help Center
> (that's for tenant Owners/Members — see `lib/help/content.ts`).

## 0. Who is a Platform Admin
- Membership lives in the `platform_admins` table (RLS-enabled, **no client policies** — service-role
  only). Sameer was seeded by migration 007.
- A Platform Admin sees a **"Platform Admin"** link in the sidebar and can open **`/admin`** (a console
  outside the tenant app shell). The console reads across all tenants via the **service-role client**.
- One login can also be a tenant **Owner** at the same time (today: `sameer@cmithayward.com` is both) —
  the roles are independent memberships. A login can additionally hold an **Org Admin** hat
  (`organization_admins`) — see §1.8 and the new `docs/org-admin-guide.md`.

---

## 1. The `/admin` console — what you can do

### 1.1 Onboard a new tenant (invite-first)
`/admin` → **"Invite a new MSP tenant"**:
- Enter Company name, (optional) company contact email, **Owner login email**, owner name, and the
  **subscription term** (monthly/quarterly/yearly/custom) — the subscription clock starts at invite-send.
- This provisions an **ownerless shell tenant** (`provision_tenant_shell`) and emails the owner an invite
  (Supabase `inviteUserByEmail` with tenant metadata). The link lands on `/auth/set-password`.
- The owner sets a password → they're in as the tenant Owner. Their seeded categories etc. are created.
- Manual fallback runbook (attach an existing email, etc.): `docs/manual-tenant-onboarding.md`.

### 1.2 Manage invites
Per-row actions while an invite is unaccepted:
- **Resend** — deletes the still-unconfirmed auth user + re-invites (same metadata).
- **Revoke** — deletes the pending login and marks the invite revoked.
- **Re-invite** — re-send a revoked owner invite.
- **Change email** — send the invite to a different address (`PATCH /api/admin/invites/[id]` / profile).
- All refuse once the invite is accepted.

### 1.3 Edit company details (platform-managed fields)
Company **Name** and **Contact Email** are platform-admin-set and **locked** from tenant edits (migration
013 trigger). Edit them in **/admin → Manage tenant** (`PATCH /api/admin/tenants/[id]/profile`).

### 1.4 Subscription & access (kill switches)
**/admin → Manage** a tenant:
- Set subscription **start / term / end** (drives the access window; `subscription_end` NULL = unlimited).
- **Platform kill switch** — suspend/enable the whole tenant (`platform_enabled` → "suspended"). Blocks
  everyone incl. the owner.
- The lifecycle: active → (7-day **read-only grace** after `subscription_end`) → expired/blocked. The
  expiry-reminder banner warns the owner in the final 7 days. See
  `docs/subscription-and-access-lifecycle-design.md`. (Per-**user** kill switch is the Owner's job, on
  Settings → Team.)

### 1.5 Tenant dossier — review before any change (Details)
`/admin` tenants table → **"Details"** (`/admin/tenants/[id]`):
- **Workspace contents**: counts (clients, products, templates, quotes, team) + **risk-flagged items** —
  signed quotes (executed contracts), in-flight (sent/viewed) quotes, open signing sessions, active products.
- **"What a deletion would remove"** manifest (row counts + Auth logins + stored files).
- **Download report** (`/admin/tenants/[id]/report`) — a print-ready branded HTML summary you can save to
  PDF and email the owner before making changes.

### 1.6 Delete a tenant (scheduled, with grace)
On the dossier page → **Danger zone** (platform-admin only; type the exact tenant name to confirm):
- **Schedule deletion** — sets a **30-day grace** date (`DELETION_GRACE_DAYS`). The owner sees a warning
  banner and can keep working/exporting until then.
- **Cancel scheduled deletion** — clears it (reversible).
- **Delete now** — immediate, irreversible purge (override the grace).
- **Purge** = remove Storage (`tenant-logos/<id>`) → delete the `tenants` row (all child rows cascade) →
  delete the members' Supabase **Auth** logins.
- ⚠️ **Due deletions do NOT auto-run yet** (no cron built). A scheduled tenant sits with the banner until
  you **Cancel** or **Delete now**, or until you call the runner: `POST /api/admin/deletions/run`
  (platform-admin, or with the `CRON_SECRET`). Design + open items: `docs/tenant-deletion-design.md`.

### 1.7 Beta signups
`/admin` → **Beta signups** card (data from the public `/beta` page → `beta_signups`):
- See company / contact / email / note / requested-at / status; **Mark invited** (or back to **new**).
- **Send test email** — SMTP diagnostic; shows the exact result + which env vars the runtime sees
  (catches the Netlify "All Scopes" gotcha — see [[netlify-env-var-scopes-gotcha]] note in memory).
- Read raw signups in Supabase if needed (`beta_signups`, service-role).

### 1.8 Organizations & Org Admins (white-label hierarchy — Phase 1+2)
`/admin` → **Organizations** section (below the Tenants list). An **Organization** is a brand/reseller
umbrella grouping multiple **Workspaces** (= tenants) under one **Org Admin**. Standalone workspaces
(`organization_id = NULL`) are direct customers and behave exactly as before. Design + roadmap:
`docs/organizations-white-label-design.md`.

What the **Platform Admin** does here:
- **Create / rename an Organization** (name + optional slug). Slug is reserved for future white-label
  URLs/domains — unused today.
- **Invite an Org Admin** (per org card) — emails an invite landing on `/auth/set-password`; on accept,
  an `organization_admins` row is created. The Org Admin is its **own principal** (no tenant row). Resend
  / revoke supported.
- **Add a workspace to an org** — either **Invite new workspace** (creates a fresh workspace + invites its
  owner, already linked to the org) or pull in an **existing standalone** workspace from the dropdown.
- **Remove a workspace from an org** (✕) — it reverts to standalone; its data is untouched. Reversible.
- The Tenants list shows an **Organization badge** per workspace (or **"Direct"** for standalone), plus an
  amber **"Added by Org Admin"** badge on workspaces an Org Admin created — your cue to **set its
  subscription term** (Org-Admin-created workspaces start with **no subscription window**).

What an **Org Admin** can do (scoped to their own org — see `docs/org-admin-guide.md`):
- A **read + limited-write** `/org` console: list their workspaces with rollups (owner, # users, # quotes,
  subscription status); **suspend / re-enable** a workspace; **invite a new workspace** into their org.
- They **cannot**: delete a workspace, set subscriptions, see quote content or product cost/margin, or
  touch any workspace outside their org. Creating a workspace **emails you** (`hello@ultraquote.io`) +
  raises the "Added by Org Admin" badge.

> **Phase boundary:** subscriptions stay **Platform-Admin-only** (Option A) until Stripe Phase 3, when the
> org becomes the billing account and gets its own subscription envelope. Deleting workspaces stays with
> you. See the design doc's phasing.

---

## 1.9 Who can do what (role × operation)

**Legend:** ✅ allowed · ❌ not allowed (by design) · 🔜 designed, not built yet.
Scopes: **Platform Admin** = all orgs + all workspaces · **Org Admin** = one org · **Owner/Member** = one
workspace.

### Platform / Organization

| Operation | Platform Admin | Org Admin | Owner | Member |
|---|---|---|---|---|
| See **all** orgs + workspaces | ✅ | ❌ | ❌ | ❌ |
| Create / rename Organization | ✅ | ❌ | ❌ | ❌ |
| Invite / revoke **Org Admins** | ✅ | ❌ | ❌ | ❌ |
| Move workspace into / out of an org | ✅ | ❌ | ❌ | ❌ |
| View **own org's** workspaces + rollups | ✅ | ✅ | ❌ | ❌ |

### Workspace lifecycle

| Operation | Platform Admin | Org Admin | Owner | Member |
|---|---|---|---|---|
| Create a new workspace (invite owner) | ✅ | ✅ (own org)¹ | ❌ | ❌ |
| Suspend / re-enable a workspace | ✅ | ✅ (own org) | ❌ | ❌ |
| Set a workspace's subscription | ✅ | ❌ (🔜 Phase 3) | ❌ | ❌ |
| **Delete** a workspace (schedule + purge) | ✅ | ❌ | ❌ | ❌ |
| Edit platform-managed fields (name/email) | ✅ | ❌ | ❌ | ❌ |
| Invite / disable **members** | ❌ | ❌ | ✅ | ❌ |

¹ Org-Admin-created workspaces notify the Platform Admin by email + carry an "Added by Org Admin" badge,
and start with **no subscription** (Platform Admin sets the term).

### Inside a workspace (the app)

| Operation | Platform Admin | Org Admin | Owner | Member |
|---|---|---|---|---|
| See quote **content** / product **cost & margin** | ❌² | ❌³ | ✅ | ✅ |
| Create / edit quotes | ❌ | ❌ | ✅ (all) | ✅ (own; read others) |
| Edit products / company settings | ❌ | ❌ | ✅ | ❌ |
| Add / edit clients | ❌ | ❌ | ✅ | add-only |

² Platform Admin sees aggregate **counts/values** in the dossier, not line-item content.
³ Org Admin visibility is **Oversight tier** (counts/status only). The opt-in **Full** tier (quote +
catalog read) is 🔜 Phase 4.

---

## 2. Operational tasks (the platform "to-do list")

### 2.1 Database migrations (manual)
- Migrations live in `supabase/migrations/NNN_*.sql`. **You run them by hand** in the Supabase SQL editor
  on **dev first, then prod** (the app doesn't auto-apply). Keep `CLAUDE.md`'s "PENDING MIGRATIONS" list
  current. After running, note it in `CLAUDE.md` + memory.
- Dev and prod are **separate Supabase projects** (prod = `pibipcdkxtldjbrsdbua`; dev = local `.env.local`).

### 2.2 Deploys
- **App** (`app.ultraquote.io`): Netlify **auto-deploys on push to `main`**. Branch for risky work →
  merge when CI is green (CI / RLS / E2E workflows). Env-var changes need a **fresh deploy** to take effect.
- **Marketing site** (`ultraquote.io`): a **separate** Netlify site, base dir `marketing-site/`, static
  (no build). Auto-deploys from `main` too (it has its own `netlify.toml`).

### 2.3 Environment variables to maintain (Netlify, **All Scopes**)
Server vars must be scoped to **Functions/Runtime** (the All-Scopes gotcha) or API routes see them empty.
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SITE_URL`.
- **Email (Zoho SMTP):** `SMTP_USER` (= `hello@ultraquote.io`), `SMTP_PASS` (Zoho app password),
  optional `SMTP_HOST/PORT/FROM`, `BETA_NOTIFY_TO`.
- **PDF service:** `PDF_SERVICE_URL`, `PDF_SERVICE_TOKEN` (Railway Puppeteer).
- **E-signature:** `DOCUSEAL_API_TOKEN`, `DOCUSEAL_WEBHOOK_SECRET` (hex).
- **AI:** `GEMINI_API_KEY`.
- **Deletions runner (future cron):** `CRON_SECRET`.

### 2.4 Email & domain
- Sends from **`hello@ultraquote.io`** (Zoho mailbox). Domains `ultraquote.io` (+ `app.`) are SPF/DKIM/
  DMARC authenticated. Supabase prod uses custom Zoho SMTP. See [[ultraquote-email-domain-setup]] memory.
- Supabase **Auth → URL Configuration**: keep `https://app.ultraquote.io/auth/set-password` (+ `/**`) and
  the `/auth/confirm` click-to-confirm allowlisted (invite/reset links).

### 2.5 Security & backups
- **MFA** (TOTP) optional per user; recovery codes (migration 011). Idle auto-logout 30 min.
- On **Supabase Pro**: enable Leaked-Password Protection (HIBP) + server-side session timeouts + daily
  backups. Until then, take manual exports before risky migrations/deletions.

---

## 3. Routine checklists

**Onboard a tenant:** /admin → Invite tenant (set term) → owner accepts → confirm Active badge → (optional)
edit company details.

**Suspend / let lapse:** /admin → Manage → toggle the kill switch, or set/clear `subscription_end`.

**Delete a tenant:** /admin → Details → review dossier → **Download report** → email the owner → Danger zone
→ Schedule deletion (or Delete now). Remember due deletions need a manual trigger (no cron yet).

**Beta:** point people to `app.ultraquote.io/beta` → watch /admin Beta signups (or the email to
`hello@ultraquote.io`) → invite via the normal tenant-onboarding flow → Mark invited.

---

## 4. Pointers
- Subscription/access: `docs/subscription-and-access-lifecycle-design.md`
- Tenant deletion: `docs/tenant-deletion-design.md`
- Tenant onboarding: `docs/tenant-onboarding-design.md`, `docs/manual-tenant-onboarding.md`
- Roles/permissions: `docs/roles-permissions-design.md`
- Pricing (frozen): `docs/pricing-model-design.md`
- Organizations / Org Admin: `docs/org-admin-guide.md` (the Org Admin's own reference) +
  `docs/organizations-white-label-design.md` (design + roadmap). Migrations: `019_organizations.sql`
  (org tables + `tenants.organization_id`), `020_org_admin_provenance.sql` (`created_by_org_admin_user`).
- Integrations roadmap: `docs/integrations-connectors-design.md`
