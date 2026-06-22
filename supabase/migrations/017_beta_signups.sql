-- 017_beta_signups.sql
-- Public beta-signup capture for the /beta landing page. Rows are written by the
-- /api/beta-signup route using the service-role client (which bypasses RLS), so
-- the table has RLS ENABLED with NO client policies — same pattern as
-- platform_admins and mfa_recovery_codes (service-role only, never readable or
-- writable from the browser).

create table if not exists public.beta_signups (
  id           uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email        text not null,
  message      text,
  source       text not null default 'beta_page',
  user_agent   text,
  created_at   timestamptz not null default now(),
  invited_at   timestamptz,        -- set when you send the invite (manual for now)
  status       text not null default 'new'  -- new | invited | declined
);

create index if not exists beta_signups_created_at_idx on public.beta_signups (created_at desc);
create index if not exists beta_signups_email_idx on public.beta_signups (lower(email));

alter table public.beta_signups enable row level security;
-- Intentionally no policies: only the service-role key (server) may read/write.
