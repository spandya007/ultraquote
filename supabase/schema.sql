-- ═══════════════════════════════════════════════════════════════════════════
-- MSP QuoteBuilder — Full Database Schema
-- Run this against your Supabase project SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- ─── Tenants ─────────────────────────────────────────────────────────────────

create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  contact_name        text,
  logo_url            text,
  address             text,
  phone               text,
  email               text,
  created_at          timestamptz not null default now(),
  stripe_customer_id  text
);

-- ─── Tenant Settings ─────────────────────────────────────────────────────────

create table public.tenant_settings (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  default_tax_rate          decimal(5,4),
  default_valid_days        int not null default 30,
  quote_number_prefix       text not null default 'QUOTE',
  quote_number_sequence     int not null default 1,
  default_payment_terms     text not null default 'Net 30',
  signature_provider        text not null default 'docuseal',
  unique (tenant_id)
);

-- ─── Users ───────────────────────────────────────────────────────────────────

create table public.users (
  id          uuid primary key,   -- matches auth.users.id
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now()
);

-- Keep users.email in sync with auth.users
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  -- Only insert if a row doesn't already exist (manual tenant provisioning may have created it)
  insert into public.users (id, tenant_id, email, full_name, role)
  select
    new.id,
    (new.raw_user_meta_data->>'tenant_id')::uuid,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'member')
  where (new.raw_user_meta_data->>'tenant_id') is not null
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- ─── MFA recovery codes ──────────────────────────────────────────────────────
-- Supabase MFA (TOTP) is native; recovery codes are not, so we store our own
-- (SHA-256 hashes). RLS enabled, NO policies → service-role only.

create table public.mfa_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id);

-- ─── Platform Admins ─────────────────────────────────────────────────────────
-- Platform-level (cross-tenant) Super Admin role. Deliberately NOT a value in
-- users.role (which is tenant-scoped). RLS enabled with NO policies — readable
-- only via the service-role key inside guarded /api/admin routes.

create table public.platform_admins (
  user_id     uuid primary key,   -- matches auth.users.id
  created_at  timestamptz not null default now()
);

-- ─── Tenant Invites ──────────────────────────────────────────────────────────
-- One row per invite (tenant owners via /admin, members via Settings → Team).
-- Writes only through service-role API routes; tenant members may read their
-- own tenant's invites.

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

-- ─── Clients ─────────────────────────────────────────────────────────────────

create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  company_name    text not null,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  address         text,
  logo_url        text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ─── Product Categories ───────────────────────────────────────────────────────

create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0
);

-- ─── Products ────────────────────────────────────────────────────────────────

create table public.products (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  zomentum_id             text,
  category_id             uuid references public.product_categories(id) on delete set null,
  name                    text not null,
  description             text,
  item_type               text check (item_type in ('Service', 'Hardware', 'Software', 'Other')),
  billing_period          text check (billing_period in ('Monthly', 'One Time')),
  unit                    text,
  unit_cost               decimal(10,2),
  unit_price              decimal(10,2),
  setup_price             decimal(10,2) not null default 0,
  is_taxable              boolean not null default false,
  is_price_overrideable   boolean not null default false,
  is_active               boolean not null default true,
  manufacturer            text,
  manufacturer_part_no    text,
  supplier_name           text,
  supplier_sku            text,
  autotask_id             text,
  quickbooks_online_id    text,
  source                  text not null default 'manual'
                            check (source in ('manual','csv','document_import')),
  source_quote_id         uuid,   -- FK to quotes added after quotes is created (below)
  created_at              timestamptz not null default now()
);

-- Product creation/change history (e.g. system-created from document import)
create table public.product_audit (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  event           text not null check (event in ('created','updated','imported')),
  source          text,
  source_quote_id uuid,   -- FK to quotes added after quotes is created (below)
  details         jsonb,
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ─── Product Pricing Tiers ────────────────────────────────────────────────────

create table public.product_pricing_tiers (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  tier_name   text not null,
  description text,
  unit_cost   decimal(10,2),
  unit_price  decimal(10,2),
  is_default  boolean not null default false,
  sort_order  int not null default 0
);

-- ─── Templates ───────────────────────────────────────────────────────────────

create table public.templates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  created_by        uuid references public.users(id) on delete set null,
  name              text not null,
  description       text,
  document_content  jsonb,
  tags              text[] not null default '{}',
  source_file_type  text check (source_file_type in ('docx', 'md', 'native')),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ─── Quotes ──────────────────────────────────────────────────────────────────

create table public.quotes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  created_by            uuid references public.users(id) on delete set null,
  client_id             uuid not null references public.clients(id),
  template_id           uuid references public.templates(id) on delete set null,
  quote_number          text not null,
  title                 text,
  status                text not null default 'draft'
                          check (status in ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired')),
  document_content      jsonb,
  valid_until           date,
  notes                 text,
  show_margins          boolean not null default false,
  include_header_footer boolean not null default true,
  tax_rate              decimal(5,4),
  payment_terms         text,
  selected_scenario_id  uuid,
  pdf_url               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  sent_at               timestamptz,
  signed_at             timestamptz,
  unique (tenant_id, quote_number)
);

-- Deferred FKs: products / product_audit reference quotes, which is defined here.
alter table public.products
  add constraint products_source_quote_id_fkey
  foreign key (source_quote_id) references public.quotes(id) on delete set null;
alter table public.product_audit
  add constraint product_audit_source_quote_id_fkey
  foreign key (source_quote_id) references public.quotes(id) on delete set null;

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger quotes_updated_at
  before update on public.quotes
  for each row execute procedure public.set_updated_at();

-- Quote number generation trigger
create or replace function public.generate_quote_number()
returns trigger language plpgsql security definer as $$
declare
  v_prefix   text;
  v_year     text;
  v_seq      int;
begin
  -- Fetch settings for this tenant
  select quote_number_prefix, quote_number_sequence
  into v_prefix, v_seq
  from public.tenant_settings
  where tenant_id = new.tenant_id
  for update;

  v_year := extract(year from now())::text;
  new.quote_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  -- Increment sequence
  update public.tenant_settings
  set quote_number_sequence = v_seq + 1
  where tenant_id = new.tenant_id;

  return new;
end;
$$;

create trigger quotes_generate_number
  before insert on public.quotes
  for each row
  when (new.quote_number is null or new.quote_number = '')
  execute procedure public.generate_quote_number();

-- ─── Quote Scenarios ──────────────────────────────────────────────────────────

create table public.quote_scenarios (
  id                      uuid primary key default gen_random_uuid(),
  quote_id                uuid not null references public.quotes(id) on delete cascade,
  name                    text not null,
  description             text,
  is_recommended          boolean not null default false,
  sort_order              int not null default 0,
  monthly_recurring_total decimal(10,2) not null default 0,
  onetime_total           decimal(10,2) not null default 0,
  tax_amount              decimal(10,2) not null default 0,
  total                   decimal(10,2) not null default 0
);

-- Add the FK now that quote_scenarios exists
alter table public.quotes
  add constraint quotes_selected_scenario_id_fk
  foreign key (selected_scenario_id) references public.quote_scenarios(id)
  on delete set null
  deferrable initially deferred;

-- ─── Quote Line Items ─────────────────────────────────────────────────────────

create table public.quote_line_items (
  id              uuid primary key default gen_random_uuid(),
  scenario_id     uuid not null references public.quote_scenarios(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  pricing_tier_id uuid references public.product_pricing_tiers(id) on delete set null,
  description     text not null,
  billing_period  text check (billing_period in ('Monthly', 'One Time')),
  quantity        decimal(10,3) not null default 1,
  unit_cost       decimal(10,2),
  unit_price      decimal(10,2),
  setup_price     decimal(10,2) not null default 0,
  is_taxable      boolean not null default false,
  discount_percent decimal(5,2) not null default 0,
  discount_amount decimal(10,2) not null default 0,
  margin_percent  decimal(5,2)
    generated always as (
      case when greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0) > 0
        then ((greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0)
               - quantity * unit_cost)
              / greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0)) * 100
        else null end
    ) stored,
  line_total      decimal(10,2)
    generated always as (
      greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0)
    ) stored,
  sort_order      int not null default 0
);

-- ─── Quote Signers ───────────────────────────────────────────────────────────

create table public.quote_signers (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references public.quotes(id) on delete cascade,
  signer_name         text not null,
  signer_email        text not null,
  role                text check (role in ('Client', 'Authorized Signatory', 'MSP Owner')),
  signing_order       int not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'sent', 'viewed', 'signed', 'declined')),
  decline_reason      text,
  provider_signer_id  text,
  sent_at             timestamptz,
  signed_at           timestamptz
);

-- ─── Quote Signature Sessions ────────────────────────────────────────────────

create table public.quote_signature_sessions (
  id                    uuid primary key default gen_random_uuid(),
  quote_id              uuid not null references public.quotes(id) on delete cascade,
  provider              text not null default 'docuseal',
  provider_document_id  text,
  status                text not null default 'pending'
                          check (status in ('pending', 'completed', 'declined')),
  signed_document_url   text,
  created_at            timestamptz not null default now(),
  completed_at          timestamptz
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

create index on public.quotes (tenant_id, status);
create index on public.quotes (client_id);
create index on public.quote_line_items (scenario_id);
create index on public.products (tenant_id, category_id);
create index on public.clients (tenant_id, is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: return the tenant_id for the currently authenticated user
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer as $$
  select tenant_id from public.users where id = auth.uid()
$$;

create or replace function public.is_tenant_owner()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select role = 'owner' from public.users where id = auth.uid()),
    false
  )
$$;

-- Quote edit rights: creator or tenant owner (used by child-table policies)
create or replace function public.can_edit_quote(p_quote_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.quotes q
    where q.id = p_quote_id
      and q.tenant_id = public.current_tenant_id()
      and (q.created_by = auth.uid() or public.is_tenant_owner())
  )
$$;

create or replace function public.can_edit_scenario(p_scenario_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.quote_scenarios s
    join public.quotes q on q.id = s.quote_id
    where s.id = p_scenario_id
      and q.tenant_id = public.current_tenant_id()
      and (q.created_by = auth.uid() or public.is_tenant_owner())
  )
$$;

-- Enable RLS on all tables
alter table public.tenants              enable row level security;
alter table public.tenant_settings      enable row level security;
alter table public.users                enable row level security;
alter table public.clients              enable row level security;
alter table public.product_categories   enable row level security;
alter table public.products             enable row level security;
alter table public.product_pricing_tiers enable row level security;
alter table public.product_audit        enable row level security;
alter table public.templates            enable row level security;
alter table public.quotes               enable row level security;
alter table public.quote_scenarios      enable row level security;
alter table public.quote_line_items     enable row level security;
alter table public.quote_signers        enable row level security;
alter table public.quote_signature_sessions enable row level security;
alter table public.platform_admins         enable row level security;  -- no policies: service-role only
alter table public.tenant_invites          enable row level security;
alter table public.mfa_recovery_codes      enable row level security;  -- no policies: service-role only

-- Policy model (see docs/roles-permissions-design.md): reads are tenant-wide;
-- writes are role/ownership-gated. Quotes/templates are creator-owned (tenant
-- owner can always edit); products/settings/client-edits are owner-only;
-- clients are add-only for members.

-- ── tenants ──────────────────────────────────────────────────────────────────
create policy "tenants: select own"
  on public.tenants for select
  using (id = public.current_tenant_id());
create policy "tenants: owner update"
  on public.tenants for update
  using (id = public.current_tenant_id() and public.is_tenant_owner());

-- ── tenant_settings ──────────────────────────────────────────────────────────
create policy "tenant_settings: select own tenant"
  on public.tenant_settings for select
  using (tenant_id = public.current_tenant_id());
create policy "tenant_settings: owner insert"
  on public.tenant_settings for insert
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "tenant_settings: owner update"
  on public.tenant_settings for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- ── users ─────────────────────────────────────────────────────────────────────
-- NOTE: no self-update policy — it would allow role self-escalation.
create policy "users: select own tenant"
  on public.users for select
  using (tenant_id = public.current_tenant_id());
create policy "users: owner update"
  on public.users for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner())
  with check (tenant_id = public.current_tenant_id());

-- ── clients ───────────────────────────────────────────────────────────────────
create policy "clients: select own tenant"
  on public.clients for select
  using (tenant_id = public.current_tenant_id());
create policy "clients: member insert"
  on public.clients for insert
  with check (tenant_id = public.current_tenant_id());
create policy "clients: owner update"
  on public.clients for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "clients: owner delete"
  on public.clients for delete
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- ── product_categories ────────────────────────────────────────────────────────
create policy "product_categories: select own tenant"
  on public.product_categories for select
  using (tenant_id = public.current_tenant_id());
create policy "product_categories: owner insert"
  on public.product_categories for insert
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "product_categories: owner update"
  on public.product_categories for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "product_categories: owner delete"
  on public.product_categories for delete
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- ── products ──────────────────────────────────────────────────────────────────
create policy "products: select own tenant"
  on public.products for select
  using (tenant_id = public.current_tenant_id());
create policy "products: owner insert"
  on public.products for insert
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "products: owner update"
  on public.products for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "products: owner delete"
  on public.products for delete
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- ── product_pricing_tiers ─────────────────────────────────────────────────────
create policy "product_pricing_tiers: select own tenant"
  on public.product_pricing_tiers for select
  using (
    product_id in (
      select id from public.products where tenant_id = public.current_tenant_id()
    )
  );
create policy "product_pricing_tiers: owner insert"
  on public.product_pricing_tiers for insert
  with check (
    public.is_tenant_owner() and product_id in (
      select id from public.products where tenant_id = public.current_tenant_id()
    )
  );
create policy "product_pricing_tiers: owner update"
  on public.product_pricing_tiers for update
  using (
    public.is_tenant_owner() and product_id in (
      select id from public.products where tenant_id = public.current_tenant_id()
    )
  );
create policy "product_pricing_tiers: owner delete"
  on public.product_pricing_tiers for delete
  using (
    public.is_tenant_owner() and product_id in (
      select id from public.products where tenant_id = public.current_tenant_id()
    )
  );

-- ── product_audit ──────────────────────────────────────────────────────────────
-- Immutable audit trail: no update/delete policies.
create policy "product_audit: select own tenant"
  on public.product_audit for select
  using (tenant_id = public.current_tenant_id());
create policy "product_audit: owner insert"
  on public.product_audit for insert
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- ── templates ────────────────────────────────────────────────────────────────
create policy "templates: select own tenant"
  on public.templates for select
  using (tenant_id = public.current_tenant_id());
create policy "templates: member insert"
  on public.templates for insert
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());
create policy "templates: creator or owner update"
  on public.templates for update
  using (
    tenant_id = public.current_tenant_id()
    and (created_by = auth.uid() or public.is_tenant_owner())
  );
create policy "templates: creator or owner delete"
  on public.templates for delete
  using (
    tenant_id = public.current_tenant_id()
    and (created_by = auth.uid() or public.is_tenant_owner())
  );

-- ── quotes ───────────────────────────────────────────────────────────────────
create policy "quotes: select own tenant"
  on public.quotes for select
  using (tenant_id = public.current_tenant_id());
create policy "quotes: member insert"
  on public.quotes for insert
  with check (tenant_id = public.current_tenant_id() and created_by = auth.uid());
create policy "quotes: creator or owner update"
  on public.quotes for update
  using (
    tenant_id = public.current_tenant_id()
    and (created_by = auth.uid() or public.is_tenant_owner())
  );
-- Deletion is owner-only (migration 014). The app further restricts it to
-- draft/declined quotes behind an explicit "arm" gate; children cascade.
create policy "quotes: owner delete"
  on public.quotes for delete
  using (
    tenant_id = public.current_tenant_id()
    and public.is_tenant_owner()
  );

-- ── quote_scenarios ──────────────────────────────────────────────────────────
create policy "quote_scenarios: select via quote tenant"
  on public.quote_scenarios for select
  using (
    quote_id in (
      select id from public.quotes where tenant_id = public.current_tenant_id()
    )
  );
create policy "quote_scenarios: insert via editable quote"
  on public.quote_scenarios for insert
  with check (public.can_edit_quote(quote_id));
create policy "quote_scenarios: update via editable quote"
  on public.quote_scenarios for update
  using (public.can_edit_quote(quote_id));
create policy "quote_scenarios: delete via editable quote"
  on public.quote_scenarios for delete
  using (public.can_edit_quote(quote_id));

-- ── quote_line_items ─────────────────────────────────────────────────────────
create policy "quote_line_items: select via quote tenant"
  on public.quote_line_items for select
  using (
    scenario_id in (
      select s.id from public.quote_scenarios s
      join public.quotes q on q.id = s.quote_id
      where q.tenant_id = public.current_tenant_id()
    )
  );
create policy "quote_line_items: insert via editable quote"
  on public.quote_line_items for insert
  with check (public.can_edit_scenario(scenario_id));
create policy "quote_line_items: update via editable quote"
  on public.quote_line_items for update
  using (public.can_edit_scenario(scenario_id));
create policy "quote_line_items: delete via editable quote"
  on public.quote_line_items for delete
  using (public.can_edit_scenario(scenario_id));

-- ── quote_signers ─────────────────────────────────────────────────────────────
create policy "quote_signers: select via quote tenant"
  on public.quote_signers for select
  using (
    quote_id in (
      select id from public.quotes where tenant_id = public.current_tenant_id()
    )
  );
create policy "quote_signers: insert via editable quote"
  on public.quote_signers for insert
  with check (public.can_edit_quote(quote_id));
create policy "quote_signers: update via editable quote"
  on public.quote_signers for update
  using (public.can_edit_quote(quote_id));
create policy "quote_signers: delete via editable quote"
  on public.quote_signers for delete
  using (public.can_edit_quote(quote_id));

-- ── quote_signature_sessions ─────────────────────────────────────────────────
create policy "quote_signature_sessions: select via quote tenant"
  on public.quote_signature_sessions for select
  using (
    quote_id in (
      select id from public.quotes where tenant_id = public.current_tenant_id()
    )
  );
create policy "quote_signature_sessions: insert via editable quote"
  on public.quote_signature_sessions for insert
  with check (public.can_edit_quote(quote_id));
create policy "quote_signature_sessions: update via editable quote"
  on public.quote_signature_sessions for update
  using (public.can_edit_quote(quote_id));
create policy "quote_signature_sessions: delete via editable quote"
  on public.quote_signature_sessions for delete
  using (public.can_edit_quote(quote_id));

-- ── tenant_invites ───────────────────────────────────────────────────────────
-- Read-only for tenant members (Settings → Team card); writes via service role.
create policy "tenant_invites: read own tenant"
  on public.tenant_invites for select
  using (tenant_id = public.current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- TENANT PROVISIONING FUNCTION
-- Creates tenant + settings + seeded product categories in one call
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.provision_tenant(
  p_name        text,
  p_email       text,
  p_owner_id    uuid,          -- auth.users.id of the owner
  p_owner_email text,
  p_owner_name  text default null
)
returns uuid language plpgsql security definer as $$
declare
  v_tenant_id uuid;
begin
  -- Create tenant
  insert into public.tenants (name, email)
  values (p_name, p_email)
  returning id into v_tenant_id;

  -- Default settings
  insert into public.tenant_settings (tenant_id)
  values (v_tenant_id);

  -- Owner user row
  insert into public.users (id, tenant_id, email, full_name, role)
  values (p_owner_id, v_tenant_id, p_owner_email, p_owner_name, 'owner')
  on conflict (id) do update set tenant_id = v_tenant_id, role = 'owner';

  -- Seed product categories
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

-- Atomic quote-number allocation. Members can create quotes but cannot update
-- tenant_settings directly (owner-only policy), so the sequence bump runs as
-- definer here. Called by /api/quotes.
create or replace function public.next_quote_number(p_tenant_id uuid)
returns text language plpgsql security definer as $$
declare
  v_prefix text;
  v_seq    int;
begin
  if not exists (
    select 1 from public.users where id = auth.uid() and tenant_id = p_tenant_id
  ) then
    raise exception 'next_quote_number: caller is not a member of this tenant';
  end if;

  insert into public.tenant_settings (tenant_id)
  values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  update public.tenant_settings
     set quote_number_sequence = quote_number_sequence + 1
   where tenant_id = p_tenant_id
   returning quote_number_prefix, quote_number_sequence - 1
   into v_prefix, v_seq;

  return v_prefix || '-' || extract(year from now())::int || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- Ownerless variant for invite-first onboarding: the owner's public.users row
-- is created by handle_new_auth_user when inviteUserByEmail inserts the auth
-- user with tenant_id/role metadata. See docs/tenant-onboarding-design.md.
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

-- ─── Realtime ────────────────────────────────────────────────────────────────
-- Live refresh for open quote editors (postgres_changes; RLS-scoped).
-- Presence channels need no DB config.

do $$ begin
  alter publication supabase_realtime add table public.quotes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.quote_scenarios;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.quote_line_items;
exception when duplicate_object then null; end $$;

-- Full old-row payloads so DELETE events carry quote_id/scenario_id for
-- client-side filtering.
alter table public.quote_scenarios  replica identity full;
alter table public.quote_line_items replica identity full;

-- ─── Storage ─────────────────────────────────────────────────────────────────
-- Single private bucket for proposal images, tenant logos, and imported-document
-- assets. The app references objects via an `sb-storage://proposal-assets/<path>`
-- scheme and resolves them to short-lived signed URLs at render time.
--
-- NOTE: on an existing project these may already have been created via the
-- Supabase dashboard; the guards below make re-running safe.

insert into storage.buckets (id, name, public)
values ('proposal-assets', 'proposal-assets', false)
on conflict (id) do nothing;

-- Authenticated users may read/write within the bucket. Tenant isolation is
-- enforced at the app layer via per-tenant / per-quote path prefixes
-- (e.g. `tenant-logos/<tenantId>/...`, `<quoteId>/...`).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'proposal-assets: authenticated read') then
    create policy "proposal-assets: authenticated read"
      on storage.objects for select to authenticated using (bucket_id = 'proposal-assets');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'proposal-assets: authenticated insert') then
    create policy "proposal-assets: authenticated insert"
      on storage.objects for insert to authenticated with check (bucket_id = 'proposal-assets');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'proposal-assets: authenticated update') then
    create policy "proposal-assets: authenticated update"
      on storage.objects for update to authenticated using (bucket_id = 'proposal-assets');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'proposal-assets: authenticated delete') then
    create policy "proposal-assets: authenticated delete"
      on storage.objects for delete to authenticated using (bucket_id = 'proposal-assets');
  end if;
end $$;
