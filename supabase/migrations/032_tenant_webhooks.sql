-- 032: Outbound webhooks (Phase C1). Two service-role-only tables — same posture
-- as tenant_integrations (secrets AES-256-GCM encrypted via lib/integrations/crypto.ts,
-- RLS enabled with NO policies so only the service-role client can touch them).
-- See docs/integrations-phase-c-api-webhooks-zapier.md §2.

-- Registered endpoints. `secret` is the HMAC signing key, stored encrypted.
create table if not exists public.tenant_webhooks (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  url              text not null,
  secret           text not null,                    -- HMAC signing key, encrypted
  events           text[] not null default '{}',     -- subscribed types ('{}' = all)
  enabled          boolean not null default true,
  source           text not null default 'user',     -- 'user' | 'zapier' | 'make'
  created_by       uuid,
  last_status      text,
  last_delivery_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tenant_webhooks_tenant_idx on public.tenant_webhooks (tenant_id);

-- Delivery log — drives retries + observability. Idempotency for consumers via
-- the payload's stable event_id (also stored here as event_id).
create table if not exists public.webhook_deliveries (
  id            uuid primary key default gen_random_uuid(),
  webhook_id    uuid not null references public.tenant_webhooks(id) on delete cascade,
  event_id      text not null,
  event_type    text not null,
  payload       jsonb not null,
  status        text not null default 'pending',      -- pending | success | failed | dead
  attempts      int not null default 0,
  response_code int,
  response_body text,
  next_retry_at timestamptz,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
-- The cron drain scans by (status, next_retry_at).
create index if not exists webhook_deliveries_retry_idx on public.webhook_deliveries (status, next_retry_at);
create index if not exists webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);

alter table public.tenant_webhooks   enable row level security;  -- NO policies (service-role only)
alter table public.webhook_deliveries enable row level security; -- NO policies (service-role only)
