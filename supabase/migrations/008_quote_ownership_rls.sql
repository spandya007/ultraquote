-- 008: Quote/template ownership + role-based RLS
-- Creator-owned quotes/templates, owner-only products/clients-edit/settings.
-- See docs/roles-permissions-design.md for the full permission matrix.

-- ─── Ownership columns ───────────────────────────────────────────────────────

alter table public.quotes
  add column created_by uuid references public.users(id) on delete set null;
alter table public.templates
  add column created_by uuid references public.users(id) on delete set null;

-- Backfill existing rows to the tenant's owner (oldest owner if several).
update public.quotes q
   set created_by = (
     select u.id from public.users u
     where u.tenant_id = q.tenant_id and u.role = 'owner'
     order by u.created_at limit 1
   )
 where q.created_by is null;

update public.templates t
   set created_by = (
     select u.id from public.users u
     where u.tenant_id = t.tenant_id and u.role = 'owner'
     order by u.created_at limit 1
   )
 where t.created_by is null;

-- ─── Helpers (security definer: bypass RLS, no policy recursion) ─────────────

create or replace function public.is_tenant_owner()
returns boolean language sql stable security definer as $$
  select coalesce(
    (select role = 'owner' from public.users where id = auth.uid()),
    false
  )
$$;

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

-- Atomic quote-number allocation. Members can create quotes but can no longer
-- update tenant_settings directly, so the sequence bump runs as definer here
-- (also fixes the previous read-then-update race in /api/quotes).
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

-- ─── Policy rewrite: reads stay tenant-wide, writes get role/ownership rules ──

-- tenants: read all members; update owner only (no insert/delete from clients)
drop policy "tenants: own tenant only" on public.tenants;
create policy "tenants: select own"
  on public.tenants for select
  using (id = public.current_tenant_id());
create policy "tenants: owner update"
  on public.tenants for update
  using (id = public.current_tenant_id() and public.is_tenant_owner());

-- tenant_settings: read all members; write owner only
drop policy "tenant_settings: own tenant only" on public.tenant_settings;
create policy "tenant_settings: select own tenant"
  on public.tenant_settings for select
  using (tenant_id = public.current_tenant_id());
create policy "tenant_settings: owner insert"
  on public.tenant_settings for insert
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_owner());
create policy "tenant_settings: owner update"
  on public.tenant_settings for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- users: read all members (creator names etc.); update owner only.
-- NOTE: deliberately no self-update policy — it would allow role self-escalation.
drop policy "users: own tenant only" on public.users;
create policy "users: select own tenant"
  on public.users for select
  using (tenant_id = public.current_tenant_id());
create policy "users: owner update"
  on public.users for update
  using (tenant_id = public.current_tenant_id() and public.is_tenant_owner())
  with check (tenant_id = public.current_tenant_id());

-- clients: read + ADD for all members; edit/delete owner only (Q1: add-only)
drop policy "clients: own tenant only" on public.clients;
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

-- product_categories: read all members; write owner only
drop policy "product_categories: own tenant only" on public.product_categories;
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

-- products: read/use all members; write owner only
drop policy "products: own tenant only" on public.products;
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

-- product_pricing_tiers: read all members; write owner only
drop policy "product_pricing_tiers: own tenant only" on public.product_pricing_tiers;
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

-- product_audit: read all members; insert owner only; immutable (no update/delete)
drop policy "product_audit: own tenant only" on public.product_audit;
create policy "product_audit: select own tenant"
  on public.product_audit for select
  using (tenant_id = public.current_tenant_id());
create policy "product_audit: owner insert"
  on public.product_audit for insert
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_owner());

-- templates: read/use all members; create any member (owns it); edit creator/owner
drop policy "templates: own tenant only" on public.templates;
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

-- quotes: read all members; create any member (owns it); edit/delete creator/owner
drop policy "quotes: own tenant only" on public.quotes;
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
create policy "quotes: creator or owner delete"
  on public.quotes for delete
  using (
    tenant_id = public.current_tenant_id()
    and (created_by = auth.uid() or public.is_tenant_owner())
  );

-- quote_scenarios: read via tenant; write only on editable quotes
drop policy "quote_scenarios: via quote tenant" on public.quote_scenarios;
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

-- quote_line_items: read via tenant; write only on editable quotes
drop policy "quote_line_items: via scenario → quote tenant" on public.quote_line_items;
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

-- quote_signers: read via tenant; write only on editable quotes
drop policy "quote_signers: via quote tenant" on public.quote_signers;
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

-- quote_signature_sessions: read via tenant; write only on editable quotes
drop policy "quote_signature_sessions: via quote tenant" on public.quote_signature_sessions;
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
