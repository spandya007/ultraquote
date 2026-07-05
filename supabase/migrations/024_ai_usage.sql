-- Per-call AI usage ledger: powers cost visibility, rate limits, and per-tenant
-- quotas across BOTH providers (Claude drafts/outlines + Gemini Ask-AI/extract).
-- Written ONLY by the API routes via the service-role client (no INSERT policy,
-- so users can't forge usage). Tenant OWNERS may read their own tenant's rows.
create table if not exists public.ai_usage (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  user_id                     uuid references auth.users(id) on delete set null,
  quote_id                    uuid references public.quotes(id) on delete set null,
  kind                        text not null,           -- 'draft_section' | 'draft_full' | 'draft_outline' | 'write' | 'extract_pricing'
  model                       text not null,           -- e.g. 'claude-opus-4-8', 'gemini-2.5-flash'
  input_tokens                integer not null default 0,  -- fresh (uncached) input
  output_tokens               integer not null default 0,
  cache_creation_input_tokens integer not null default 0,  -- Anthropic prompt-cache WRITE (0 for Gemini)
  cache_read_input_tokens     integer not null default 0,  -- Anthropic prompt-cache READ  (0 for Gemini)
  cost_usd                    numeric(12,6) not null default 0,  -- snapshot at insert (rates change over time)
  created_at                  timestamptz not null default now()
);

create index if not exists ai_usage_tenant_created_idx on public.ai_usage (tenant_id, created_at desc);
create index if not exists ai_usage_user_created_idx   on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

-- Owners can read their own tenant's usage (future usage/billing view). Writes are
-- service-role only (the routes) — no insert/update/delete policies.
drop policy if exists ai_usage_owner_read on public.ai_usage;
create policy ai_usage_owner_read on public.ai_usage
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.tenant_id = ai_usage.tenant_id and u.role = 'owner'
    )
  );
