-- 029_tenant_integrations.sql
-- Integrations framework (Phase A / A2): per-tenant connection registry + the
-- first external-id linkage columns for QuickBooks Online. Tokens are stored
-- app-layer encrypted (lib/integrations/crypto.ts). See
-- docs/integrations-phase-a-plan.md (A2). Idempotent.

create table if not exists public.tenant_integrations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  provider       text not null,                    -- 'qbo' | 'hubspot' | ...
  status         text not null default 'connected'
                   check (status in ('connected','error','disconnected')),
  auth_type      text not null default 'oauth2',   -- 'oauth2' | 'api_key'
  access_token   text,     -- encrypted at rest (app-layer AES-256-GCM)
  refresh_token  text,     -- encrypted at rest
  expires_at     timestamptz,
  account_ref    text,     -- realmId (QBO) / portalId / customer number
  scopes         text,
  settings       jsonb not null default '{}'::jsonb,
  connected_by   uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- Tokens are secrets — service-role only: RLS enabled, NO policies (like
-- platform_admins / plan_features). Never queried from the browser.
alter table public.tenant_integrations enable row level security;

create index if not exists tenant_integrations_tenant_idx
  on public.tenant_integrations (tenant_id);

-- QBO linkage columns (additive, nullable). More added when estimates/products land.
alter table public.clients add column if not exists qbo_customer_id text;
alter table public.quotes  add column if not exists qbo_invoice_id  text;
