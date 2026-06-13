-- 012: Tenant subscription window + platform/tenant access kill switches
-- See docs/subscription-and-access-lifecycle-design.md for the full design.
--
-- Adds:
--   tenants.subscription_start / subscription_end / subscription_term  (the window)
--   tenants.platform_enabled (+ suspended_at/reason)  — PLATFORM kill switch (req #5)
--   users.enabled (+ disabled_at/by)                  — TENANT→USER kill switch (req #6)
--   read/write access helper functions (for the phase-2 RLS hardening)
--
-- Access model (resolved in app code now; helpers mirror it in SQL for later RLS):
--   read  allowed  = platform_enabled AND (end IS NULL OR end + 7d >= today)   [grace allows reads]
--   write allowed  = platform_enabled AND (end IS NULL OR end      >= today)   [grace blocks writes]
--   ...AND user.enabled for the per-user switch.  NULL end = unlimited.

-- ─── Tenant subscription + platform kill switch ──────────────────────────────

alter table public.tenants
  add column if not exists subscription_start date,
  add column if not exists subscription_end   date,
  add column if not exists subscription_term   text
       check (subscription_term in ('monthly', 'quarterly', 'yearly', 'custom')),
  add column if not exists platform_enabled    boolean not null default true,
  add column if not exists suspended_at        timestamptz,
  add column if not exists suspended_reason    text;

-- ─── Tenant → user kill switch ───────────────────────────────────────────────

alter table public.users
  add column if not exists enabled     boolean not null default true,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references public.users(id) on delete set null;

-- ─── Backfill existing tenants: seeded start, unlimited end (grandfathered) ───
-- Existing tenants get subscription_start = their created date and a NULL end
-- (Unlimited/active), so shipping this locks nobody out. The platform admin
-- opts a tenant into a dated subscription explicitly via /admin.

update public.tenants
   set subscription_start = coalesce(subscription_start, created_at::date)
 where subscription_start is null;

-- ─── Access helper functions (define now; wire into RLS in a later migration) ─
-- GRACE_DAYS is hardcoded as 7 here to match lib/access/access-state.ts.
-- Keep the two in sync (or move to a single config row later).
-- security definer + stable so they can be used inside RLS without recursion.

create or replace function public.tenant_can_read(t uuid)
returns boolean language sql stable security definer as $$
  select coalesce(platform_enabled, true)
     and (subscription_end is null
          or subscription_end + interval '7 days' >= current_date)
  from public.tenants where id = t
$$;

create or replace function public.tenant_can_write(t uuid)
returns boolean language sql stable security definer as $$
  select coalesce(platform_enabled, true)
     and (subscription_end is null or subscription_end >= current_date)
  from public.tenants where id = t
$$;

create or replace function public.user_can_read(u uuid)
returns boolean language sql stable security definer as $$
  select coalesce(usr.enabled, true) and public.tenant_can_read(usr.tenant_id)
  from public.users usr where usr.id = u
$$;

create or replace function public.user_can_write(u uuid)
returns boolean language sql stable security definer as $$
  select coalesce(usr.enabled, true) and public.tenant_can_write(usr.tenant_id)
  from public.users usr where usr.id = u
$$;
