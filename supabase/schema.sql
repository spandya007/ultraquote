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

-- ─── Clients ─────────────────────────────────────────────────────────────────

create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  company_name    text not null,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  address         text,
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
  created_at              timestamptz not null default now()
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
  margin_percent  decimal(5,2)
    generated always as (
      case when unit_price > 0 then ((unit_price - unit_cost) / unit_price) * 100 else null end
    ) stored,
  line_total      decimal(10,2)
    generated always as (quantity * unit_price) stored,
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

-- Enable RLS on all tables
alter table public.tenants              enable row level security;
alter table public.tenant_settings      enable row level security;
alter table public.users                enable row level security;
alter table public.clients              enable row level security;
alter table public.product_categories   enable row level security;
alter table public.products             enable row level security;
alter table public.product_pricing_tiers enable row level security;
alter table public.templates            enable row level security;
alter table public.quotes               enable row level security;
alter table public.quote_scenarios      enable row level security;
alter table public.quote_line_items     enable row level security;
alter table public.quote_signers        enable row level security;
alter table public.quote_signature_sessions enable row level security;

-- ── tenants ──────────────────────────────────────────────────────────────────
create policy "tenants: own tenant only"
  on public.tenants for all
  using (id = public.current_tenant_id());

-- ── tenant_settings ──────────────────────────────────────────────────────────
create policy "tenant_settings: own tenant only"
  on public.tenant_settings for all
  using (tenant_id = public.current_tenant_id());

-- ── users ─────────────────────────────────────────────────────────────────────
create policy "users: own tenant only"
  on public.users for all
  using (tenant_id = public.current_tenant_id());

-- ── clients ───────────────────────────────────────────────────────────────────
create policy "clients: own tenant only"
  on public.clients for all
  using (tenant_id = public.current_tenant_id());

-- ── product_categories ────────────────────────────────────────────────────────
create policy "product_categories: own tenant only"
  on public.product_categories for all
  using (tenant_id = public.current_tenant_id());

-- ── products ──────────────────────────────────────────────────────────────────
create policy "products: own tenant only"
  on public.products for all
  using (tenant_id = public.current_tenant_id());

-- ── product_pricing_tiers ─────────────────────────────────────────────────────
create policy "product_pricing_tiers: own tenant only"
  on public.product_pricing_tiers for all
  using (
    product_id in (
      select id from public.products where tenant_id = public.current_tenant_id()
    )
  );

-- ── templates ────────────────────────────────────────────────────────────────
create policy "templates: own tenant only"
  on public.templates for all
  using (tenant_id = public.current_tenant_id());

-- ── quotes ───────────────────────────────────────────────────────────────────
create policy "quotes: own tenant only"
  on public.quotes for all
  using (tenant_id = public.current_tenant_id());

-- ── quote_scenarios ──────────────────────────────────────────────────────────
create policy "quote_scenarios: via quote tenant"
  on public.quote_scenarios for all
  using (
    quote_id in (
      select id from public.quotes where tenant_id = public.current_tenant_id()
    )
  );

-- ── quote_line_items ─────────────────────────────────────────────────────────
create policy "quote_line_items: via scenario → quote tenant"
  on public.quote_line_items for all
  using (
    scenario_id in (
      select s.id from public.quote_scenarios s
      join public.quotes q on q.id = s.quote_id
      where q.tenant_id = public.current_tenant_id()
    )
  );

-- ── quote_signers ─────────────────────────────────────────────────────────────
create policy "quote_signers: via quote tenant"
  on public.quote_signers for all
  using (
    quote_id in (
      select id from public.quotes where tenant_id = public.current_tenant_id()
    )
  );

-- ── quote_signature_sessions ─────────────────────────────────────────────────
create policy "quote_signature_sessions: via quote tenant"
  on public.quote_signature_sessions for all
  using (
    quote_id in (
      select id from public.quotes where tenant_id = public.current_tenant_id()
    )
  );

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
