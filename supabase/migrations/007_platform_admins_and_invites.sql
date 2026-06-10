-- 007: Platform admins + tenant invites + ownerless tenant provisioning
-- Backing for invite-first tenant onboarding and Settings → Team member invites.
-- See docs/tenant-onboarding-design.md

-- ─── Platform admins ─────────────────────────────────────────────────────────
-- Platform-level (cross-tenant) Super Admin role. Deliberately NOT a value in
-- users.role (which is tenant-scoped). RLS is enabled with NO policies: the
-- table is invisible to anon/authenticated clients and readable only via the
-- service-role key inside guarded /api/admin routes and the /admin layout.

create table public.platform_admins (
  user_id     uuid primary key,   -- matches auth.users.id
  created_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Seed the initial platform admin (no-op if the email has no auth user yet).
insert into public.platform_admins (user_id)
select id from auth.users where email = 'sameer@cmithayward.com'
on conflict (user_id) do nothing;

-- ─── Tenant invites ──────────────────────────────────────────────────────────
-- One row per outstanding/settled invite (tenant owners via /admin, members
-- via Settings → Team). Writes happen only through service-role API routes;
-- tenant members may read their own tenant's invites for the Team card.

create table public.tenant_invites (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  email        text not null,
  full_name    text,
  role         text not null default 'member' check (role in ('owner', 'member')),
  invited_by   uuid,               -- auth.users.id of the inviter
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);

create index tenant_invites_tenant_idx on public.tenant_invites (tenant_id);
create index tenant_invites_email_idx  on public.tenant_invites (email);

alter table public.tenant_invites enable row level security;

create policy "tenant_invites: read own tenant"
  on public.tenant_invites for select
  using (tenant_id = public.current_tenant_id());

-- ─── Ownerless tenant provisioning ───────────────────────────────────────────
-- Like provision_tenant(), but without the owner users row: with invite-first
-- onboarding the owner's public.users row is created by the existing
-- handle_new_auth_user trigger when inviteUserByEmail inserts the auth user
-- with tenant_id/role metadata.

create or replace function public.provision_tenant_shell(
  p_name  text,
  p_email text
)
returns uuid language plpgsql security definer as $$
declare
  v_tenant_id uuid;
begin
  insert into public.tenants (name, email)
  values (p_name, p_email)
  returning id into v_tenant_id;

  insert into public.tenant_settings (tenant_id)
  values (v_tenant_id);

  insert into public.product_categories (tenant_id, name, sort_order)
  values
    (v_tenant_id, 'Managed Services',      1),
    (v_tenant_id, 'Hardware',              2),
    (v_tenant_id, 'Software',              3),
    (v_tenant_id, 'Security',              4),
    (v_tenant_id, 'Cloud',                 5),
    (v_tenant_id, 'Professional Services', 6);

  return v_tenant_id;
end;
$$;
