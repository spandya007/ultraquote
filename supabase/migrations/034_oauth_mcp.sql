-- 034: OAuth 2.1 authorization server for the remote MCP connector (Phase C+,
-- Appendix A.2 slice 2). Lets MCP clients (claude.ai, Claude Desktop, Cursor) add
-- SmartProps "by URL": dynamic client registration (RFC 7591) + auth-code flow
-- with PKCE (RFC 7636) + bearer access/refresh tokens. All tables service-role
-- only (RLS enabled, NO policies) — same posture as tenant_api_keys. Codes/tokens
-- are stored as SHA-256 hashes; the plaintext is only ever returned once.

-- Dynamically-registered OAuth clients (public clients — PKCE, no secret).
create table if not exists public.oauth_clients (
  client_id                   text primary key,
  client_name                 text,
  redirect_uris               text[] not null default '{}',
  grant_types                 text[] not null default '{authorization_code,refresh_token}',
  response_types              text[] not null default '{code}',
  token_endpoint_auth_method  text not null default 'none',
  scope                       text,
  created_at                  timestamptz not null default now()
);

-- Short-lived, single-use authorization codes (consumed at the token endpoint).
create table if not exists public.oauth_authorization_codes (
  code_hash             text primary key,
  client_id             text not null,
  user_id               uuid not null,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256',
  scope                 text not null default 'read',
  resource              text,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now()
);

-- Access + refresh tokens (kind distinguishes them). Refresh is rotated on use.
create table if not exists public.oauth_tokens (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  kind         text not null check (kind in ('access','refresh')),
  client_id    text not null,
  user_id      uuid not null,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  scope        text not null default 'read',
  resource     text,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists oauth_tokens_tenant_idx on public.oauth_tokens (tenant_id);

alter table public.oauth_clients             enable row level security; -- NO policies (service-role only)
alter table public.oauth_authorization_codes enable row level security; -- NO policies
alter table public.oauth_tokens              enable row level security; -- NO policies
