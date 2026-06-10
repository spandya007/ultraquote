# Manual Tenant Onboarding (runbook)

> **⚠️ Superseded for normal use:** tenants are now onboarded from the
> **Platform Admin console** (`/admin` → "Invite a new MSP tenant"), and team
> members from **Settings → Team** — see `docs/tenant-onboarding-design.md`.
> Keep this runbook as a fallback (e.g. attaching an email that already has an
> auth account to a tenant, or when invite email isn't an option).

How to add a new MSP **tenant** (and its owner login) by hand. ~5 minutes per tenant.

> Background: the app is multi-tenant. RLS isolates data by tenant via
> `current_tenant_id()` = `select tenant_id from public.users where id = auth.uid()`.
> So a working login requires **two linked things**: a Supabase **Auth user**, and
> a matching **`public.users`** row that points at the tenant. The
> `provision_tenant()` SQL function creates the tenant + settings + the owner's
> `public.users` row + seed product categories in one call.

---

## Step 1 — Create the owner's Auth user

Supabase Dashboard → **Authentication → Users → Add user**:

- **Email:** the owner's email (e.g. `owner@newmsp.com`)
- **Password:** set one (or use "Auto-generate" / "Send invite" if you prefer the
  owner to set their own on first login)
- Leave user metadata empty.
- Click **Create user**.

Then **copy the user's UID** (the `id` shown in the users list — a UUID). You'll
need it in Step 2.

> Note: creating the Auth user fires the `handle_new_auth_user` trigger, but since
> there's no `tenant_id` in metadata yet, it does nothing — `provision_tenant`
> creates the `public.users` row in the next step.

---

## Step 2 — Provision the tenant

Supabase Dashboard → **SQL Editor → New query**, run (substituting values):

```sql
select public.provision_tenant(
  'New MSP, Inc.',          -- p_name:        tenant/company name
  'billing@newmsp.com',     -- p_email:       tenant contact email
  '00000000-0000-0000-0000-000000000000',  -- p_owner_id: the Auth UID from Step 1
  'owner@newmsp.com',       -- p_owner_email: owner's login email (match Step 1)
  'Jane Owner'              -- p_owner_name:  owner's full name (optional)
);
```

This creates: the **tenant**, its **tenant_settings** (defaults: prefix `QUOTE`,
Net 30, 30-day validity), the **owner `users` row** (role `owner`, linked to the
tenant), and seeds **6 product categories** (Managed Services, Hardware, Software,
Security, Cloud, Professional Services). It returns the new `tenant_id`.

---

## Step 3 — Verify

```sql
-- owner is linked to the tenant
select u.email, u.role, t.name as tenant
from public.users u join public.tenants t on t.id = u.tenant_id
where u.email = 'owner@newmsp.com';
```

You should see one row: the owner, role `owner`, with the tenant name.

---

## Step 4 — Owner logs in

The owner goes to the app URL → **/login** → signs in with the email + password
from Step 1. The sidebar will show "UltraQuote Builder for **New MSP, Inc.**".

First things they should do in **Settings**:
- Company Profile (logo, contact, address) — feeds the PDF + `{{tenant.*}}` fields.
- Quote Defaults (quote-number prefix, tax rate, payment terms, validity).

Then import products (Products → Import CSV) or add them manually.

---

## Adding more users to an existing tenant (members)

1. Create the Auth user (Step 1) and copy their UID.
2. Insert their `public.users` row pointing at the existing tenant:

```sql
insert into public.users (id, tenant_id, email, full_name, role)
values (
  '<auth-uid>',
  (select id from public.tenants where name = 'New MSP, Inc.'),
  'member@newmsp.com',
  'Member Name',
  'member'                 -- 'owner' or 'member'
);
```

---

## Troubleshooting

- **Login works but everything is empty / "permission" errors:** the
  `public.users` row is missing or has the wrong `tenant_id` (RLS can't resolve
  the tenant). Re-check Step 2/3; the `users.id` must equal the Auth UID exactly.
- **"User already registered":** the email already has an Auth user — reuse that
  UID in Step 2 instead of creating a new one (`provision_tenant` upserts the
  `users` row via `on conflict (id)`).
- **Owner can't reset password:** use Authentication → Users → the user → "Send
  password recovery", or set a new password there.
