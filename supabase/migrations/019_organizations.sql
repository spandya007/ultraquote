-- Organizations layer — Phase 1 (hierarchy foundation)
-- Adds an Organization entity above the existing Workspace (tenants) level so
-- UltraQuote can be white-labeled / resold to MSP brands (CMIT, TeamLogic, …).
-- See docs/organizations-white-label-design.md.
--
-- Backward-compatible: every existing tenant gets organization_id = NULL
-- (standalone) and behaves exactly as before. The new org-level access gate
-- in getAccessState only activates once organization_id is set on a tenant.

-- ─── organizations ───────────────────────────────────────────────────────────
-- The billing + brand umbrella for a group of Workspaces.
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text unique,
  platform_enabled boolean not null default true,
  logo_url         text,
  accent           text,
  created_at       timestamptz not null default now()
);
alter table public.organizations enable row level security;
-- No client policies: accessible only via the service-role key inside guarded
-- /api/admin and /org routes (same pattern as platform_admins).

-- ─── organization_admins ─────────────────────────────────────────────────────
-- Principals who manage one Organization. NOT rows in public.users (no
-- tenant_id); modeled exactly like platform_admins (separate principal table).
create table public.organization_admins (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.organization_admins enable row level security;
-- No client policies.

-- ─── org_admin_invites ───────────────────────────────────────────────────────
-- Invite tracking for Org Admin invitations (mirrors tenant_invites structure).
create table public.org_admin_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  full_name   text,
  invited_by  uuid references auth.users(id),
  status      text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked')),
  created_at              timestamptz not null default now(),
  accepted_at             timestamptz,
  invited_auth_user_id    uuid,   -- auth.users.id of the pending invitee; cleared on accept
  unique (org_id, email)
);
alter table public.org_admin_invites enable row level security;
-- No client policies.

-- ─── tenants.organization_id ─────────────────────────────────────────────────
-- Links a Workspace to an Organization. NULL = standalone (today's model,
-- unchanged). Adding is fully backward-compatible — no data migration needed.
alter table public.tenants
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists tenants_organization_id_idx
  on public.tenants (organization_id);
