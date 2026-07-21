# Tenant Onboarding, Super Admin & Team Invites — Design

Status: **approved** (flow decisions confirmed 2026-06-10) · Implements backlog #11
Replaces the manual runbook (`docs/manual-tenant-onboarding.md`) as the primary
onboarding path; the runbook stays as a fallback.

## Decisions (confirmed with user)

1. **Invite-first onboarding.** The platform Super Admin enters the MSP company
   name + owner email in an `/admin` console → Supabase sends an invite email →
   the owner clicks the link, sets a password → lands in a fully provisioned
   tenant. No public signup surface; validation is implicit (only invited MSPs
   get in).
2. **Member invites included.** Tenant owners invite their own team members from
   Settings → Team. This removes the last manual-SQL onboarding path.
3. **Per-tenant user counts tracked for future billing.** Billing basis = count
   of `public.users` rows per tenant (live query — no counter column to drift).
   Surfaced in the admin console per tenant and in Settings → Team.
   `tenants.stripe_customer_id` already exists for the eventual Stripe hookup.

## Existing foundation this builds on

- RLS isolates by tenant via `current_tenant_id()` = `users.tenant_id` for
  `auth.uid()`. A working login = Auth user + matching `public.users` row.
- **`handle_new_auth_user` trigger** (already deployed): on `auth.users` insert,
  creates the `public.users` row from `raw_user_meta_data` (`tenant_id`,
  `full_name`, `role`) when `tenant_id` is present. `inviteUserByEmail(email,
  { data })` stores `data` as that metadata and inserts the auth user
  *immediately* (unconfirmed) — so the `users` row exists from the moment of
  invite, and acceptance is just "set a password". **No trigger change needed.**
- `createServiceClient()` (`lib/supabase/server.ts`) + `SUPABASE_SERVICE_ROLE_KEY`
  already exist (used by the DocuSeal webhook).

## Super Admin modeling

**Dedicated `platform_admins` table** (uuid pk = auth user id), NOT a value in
`users.role`:

- `users.role` is tenant-scoped (`owner`/`member`); overloading it would leak
  platform semantics into every tenant-level role check.
- RLS is enabled on `platform_admins` with **no policies** → invisible to all
  normal clients; only service-role code can read it. Cross-tenant reads happen
  exclusively in **service-role admin API routes / server components** guarded
  by a `platform_admins` lookup — tenant RLS policies are untouched (zero risk
  of widening tenant isolation).
- A platform admin is usually *also* a regular tenant user (Sameer = CMIT
  Hayward owner + platform admin). The two are independent.
- Guard helper: `requirePlatformAdmin()` (`lib/platform-admin.ts`) — resolves
  the session user via the cookie client, checks membership via the service
  client. Used by the `/admin` layout (redirect home) and every `/api/admin/*`
  route (403).

## Invite tracking: `tenant_invites` table

Supabase has no "list pending invites" API shape that fits our UI (and member
invites need tenant-scoped visibility), so we keep our own tracking row per
invite:

```
tenant_invites (
  id uuid pk, tenant_id fk→tenants, email text, full_name text,
  role 'owner'|'member', invited_by uuid (auth uid),
  status 'pending'|'accepted'|'revoked', created_at, accepted_at
)
```

- RLS: tenant members can **select** their own tenant's invites (feeds the
  Settings → Team card). All writes go through service-role routes (no
  insert/update/delete policies).
- Status transitions: `pending` → `accepted` (set server-side when the invited
  user completes set-password) or `pending` → `revoked` (admin/owner action).

## Flow A — Super Admin invites a new MSP tenant

`POST /api/admin/tenants/invite` `{ company_name, contact_email, owner_email, owner_name }`:

1. Guard `requirePlatformAdmin()`.
2. `provision_tenant_shell(name, email)` (new SQL fn, migration 007): tenant +
   `tenant_settings` defaults + 6 seed product categories — **no owner row**
   (the trigger creates it at invite). Single transaction.
3. `auth.admin.inviteUserByEmail(owner_email, { data: { tenant_id, role:
   'owner', full_name }, redirectTo: `${origin}/api/auth/callback?next=/auth/set-password` })`
   → Supabase emails the invite; the trigger creates the `users` row now.
4. Insert `tenant_invites` row (`role='owner'`).

Failure handling: if the email already has an Auth user, the route returns a
clear 409 ("email already registered — use the runbook to attach them") and
deletes the just-created shell tenant so no orphan remains.

**Resend** (`POST /api/admin/invites/[id]` `{action:'resend'}`): Supabase can't
re-send an invite to an existing auth user, so resend = delete the (still
unconfirmed) auth user → `inviteUserByEmail` again with the same metadata.
Refuses if the user has already confirmed/signed in.

**Revoke** (`{action:'revoke'}`): delete the unconfirmed auth user + its
`public.users` row, mark invite `revoked`. The shell tenant **remains** (visible
in the console as "no owner") so the admin can re-invite a different email; an
explicit tenant delete is out of scope for this pass.

## Flow B — invite acceptance (owner or member)

1. Invite email link → Supabase verify endpoint → redirects **directly to
   `/auth/set-password` with the session tokens in the URL hash**
   (`#access_token=…&type=invite`). Admin-sent invites use the implicit flow,
   NOT PKCE — there is no `?code=`, and the hash never reaches the server, so
   no server callback is involved. The redirect URL deliberately has NO query
   string: Supabase's allowlist matching is unreliable with query params and
   silently falls back to the Site URL on mismatch. (The `/api/auth/callback`
   route still exists for OAuth/PKCE `?code=` flows and sanitizes its `next`
   param to same-site paths.)
2. `/auth/set-password` is **public** (middleware allows `/auth/*`) and
   establishes the session client-side: explicit `setSession()` from the hash
   tokens (plus `createBrowserClient`'s own `detectSessionInUrl`), strips the
   hash from history, then shows the password form (email + inviting tenant
   name fetched under RLS) → `supabase.auth.updateUser({ password })` →
   `POST /api/auth/accept-invite` (service role marks the user's pending
   `tenant_invites` rows `accepted`, sets `accepted_at`) → redirect `/`.
3. If the link is expired/already used (they're single-use), the page shows an
   "invalid or expired" state telling the user to ask for a re-send.

**Manual Supabase config (one-time):** Auth → URL Configuration → add redirect
URLs `https://app.smartprops.io/auth/set-password` and
`http://localhost:3000/auth/set-password` (or the wildcard forms
`https://app.smartprops.io/**` + `http://localhost:3000/**`). Entry order
in the allowlist does not matter.

## Flow C — tenant owner invites team members

Settings → **Team** card (`settings-client.tsx`):

- Lists the tenant's `users` (RLS-visible) + pending `tenant_invites`, with a
  user count ("N of your seats" — billing basis).
- Owner-only invite form (email + name) → `POST /api/team/invite`: verifies the
  *caller* is `role='owner'` in their `users` row (session client), then via
  service role: reject if email already in `public.users`,
  `inviteUserByEmail(email, { data: { tenant_id: caller's, role: 'member',
  full_name }, redirectTo: …/set-password })`, insert `tenant_invites`
  (`role='member'`).
- Revoke pending member invite: `POST /api/team/invites/[id]` `{action:'revoke'}`
  (same owner check + tenant match; deletes unconfirmed auth user, marks revoked).
- Members see the list read-only (no invite/revoke controls).

## Admin console UI (`/admin`)

Own minimal layout (not the tenant dashboard shell) with a back-to-app link;
server component guarded by `requirePlatformAdmin()`.

- **Tenant table** (service-role, cross-tenant): name, contact email, owner
  email, **user count**, quote count, created date, invite status badge
  (pending / accepted / revoked / no owner).
- **Invite tenant** form: company name, contact email, owner email, owner name.
- Per-pending-invite actions: **Resend**, **Revoke**.
- Sidebar in the main app shows a **Platform Admin** link only when the
  logged-in user is in `platform_admins` (checked in the dashboard layout
  server component, passed to `Sidebar` as a prop).

## Migration 007 (`supabase/migrations/007_platform_admins_and_invites.sql`)

1. `platform_admins` table, RLS enabled, **no policies**.
2. Seed: insert Sameer by email lookup from `auth.users`
   (`sameer@cmithayward.com`), `on conflict do nothing`.
3. `tenant_invites` table + RLS select policy (`tenant_id = current_tenant_id()`).
4. `provision_tenant_shell(p_name, p_email) returns uuid` (security definer) —
   tenant + settings + seed categories, no owner.

## Env / config checklist (go-live)

- `SUPABASE_SERVICE_ROLE_KEY` — already set (DocuSeal webhook uses it). Must
  also be present in Netlify env.
- Supabase Auth redirect-URL allowlist (above).
- Supabase invite **email template** (Auth → Email Templates → "Invite user")
  — optional copy polish; default works. The invite metadata is exposed to the
  template as `{{ .Data.full_name }}`, `{{ .Data.role }}` (branch owner vs
  member copy), and `{{ .Data.tenant_name }}` (the inviting company);
  `{{ .ConfirmationURL }}` must be kept. Changing the from-name/address (and
  lifting the built-in mailer's rate limit) requires custom SMTP: Project
  Settings → Authentication → SMTP Settings.
- Note: Supabase's built-in SMTP is rate-limited (~a few emails/hour) and fine
  for low-volume tenant/member invites; configure custom SMTP in the Supabase
  dashboard later if volume grows (no code change).

## Future (explicitly out of scope this pass)

- Tenant delete / suspend from the console.
- Seat limits & Stripe billing (user counts are surfaced now as the basis).
- Member role management (promote member→owner) and removing existing users.
- Self-serve "request access" page feeding the console as an approval queue.
