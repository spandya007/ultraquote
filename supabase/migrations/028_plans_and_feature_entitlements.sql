-- 028_plans_and_feature_entitlements.sql
-- Subscription plan (tier) on tenants + an admin-editable feature×plan
-- entitlements matrix. Introduced for the integrations feature gate
-- (docs/integrations-phase-a-plan.md, A1). Plan is admin-set for now (no Stripe);
-- forward-compatible with the deferred billing build. Idempotent.

-- 1) Plan (tier) on the tenant. Existing rows default to 'beta'.
alter table public.tenants
  add column if not exists plan text not null default 'beta';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_plan_check') then
    alter table public.tenants
      add constraint tenants_plan_check
      check (plan in ('beta','pay_per_use','starter','standard','pro','ultra'));
  end if;
end $$;

-- 2) Feature×plan entitlements matrix — the admin-editable source of truth for
-- WHICH plans include a feature. WHAT features exist lives in code
-- (lib/billing/features.ts).
create table if not exists public.plan_features (
  plan        text not null,
  feature_key text not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  primary key (plan, feature_key)
);

-- Service-role / platform-admin only (like platform_admins): RLS on, NO policies.
alter table public.plan_features enable row level security;

-- 3) Seed the 'integrations' feature: ON for every subscription tier + beta,
-- OFF for pay-per-use (owner decision 2026-07-13). Idempotent.
insert into public.plan_features (plan, feature_key, enabled) values
  ('beta',        'integrations', true),
  ('pay_per_use', 'integrations', false),
  ('starter',     'integrations', true),
  ('standard',    'integrations', true),
  ('pro',         'integrations', true),
  ('ultra',       'integrations', true)
on conflict (plan, feature_key) do nothing;
