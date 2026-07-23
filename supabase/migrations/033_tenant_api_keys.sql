-- 033: Public REST API keys (Phase C2). Keys are SHA-256 hashed (fast hash is fine
-- for high-entropy keys — same posture as mfa_recovery_codes), stored service-role
-- only (RLS enabled, NO policies). The full key is shown ONCE at creation.
-- A per-key fixed-window rate limiter lives alongside (no Redis in-stack).
-- See docs/integrations-phase-c-api-webhooks-zapier.md §3.

create table if not exists public.tenant_api_keys (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  key_hash    text not null,                      -- sha256(full key)
  key_prefix  text not null,                      -- e.g. "sp_live_ab12cd34" for display
  scopes      text[] not null default '{read}',   -- read | write
  created_by  uuid,
  last_used_at timestamptz,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index if not exists tenant_api_keys_hash_idx on public.tenant_api_keys (key_hash);
create index if not exists tenant_api_keys_tenant_idx on public.tenant_api_keys (tenant_id);
alter table public.tenant_api_keys enable row level security;  -- NO policies (service-role only)

-- Per-key fixed-window request counter (1-minute buckets). Atomic increment via
-- the definer function below so concurrent serverless requests can't race.
create table if not exists public.api_rate_counters (
  key_id       uuid not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key_id, window_start)
);
alter table public.api_rate_counters enable row level security;  -- NO policies (service-role only)

-- Increment the bucket and return the new count; opportunistically prunes this
-- key's stale windows. Called with p_window = the truncated minute.
create or replace function public.api_rate_increment(p_key_id uuid, p_window timestamptz)
returns int language plpgsql security definer as $$
declare c int;
begin
  insert into public.api_rate_counters (key_id, window_start, count)
  values (p_key_id, p_window, 1)
  on conflict (key_id, window_start) do update set count = api_rate_counters.count + 1
  returning count into c;
  delete from public.api_rate_counters
    where key_id = p_key_id and window_start < p_window - interval '10 minutes';
  return c;
end; $$;
