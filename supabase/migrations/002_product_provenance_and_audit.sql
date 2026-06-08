-- Provenance + history for products, enabling system-created catalog entries
-- (e.g. from document-pricing extraction) to be traced and distinguished from
-- hand-curated / CSV-imported ones. Run in the Supabase SQL editor.

alter table public.products
  add column if not exists source text not null default 'manual'
    check (source in ('manual','csv','document_import')),
  add column if not exists source_quote_id uuid references public.quotes(id) on delete set null;

create table if not exists public.product_audit (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  product_id      uuid references public.products(id) on delete set null,
  event           text not null check (event in ('created','updated','imported')),
  source          text,                  -- e.g. 'document_import', 'csv', 'manual'
  source_quote_id uuid references public.quotes(id) on delete set null,
  details         jsonb,                 -- snapshot of what was created/changed
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

alter table public.product_audit enable row level security;

create policy "product_audit: own tenant only"
  on public.product_audit for all
  using (tenant_id = public.current_tenant_id());
