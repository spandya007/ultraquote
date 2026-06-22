-- E2E seed (applied by tests/e2e/global-setup.ts AFTER schema + migrations).
-- Creates tenants, settings, a catalog product, and a client. Auth users (and
-- their public.users rows) are created separately via the GoTrue admin API in
-- global-setup so they have real passwords.

-- Active tenant: NULL subscription_end = unlimited/active -> access state "ok".
insert into public.tenants (id, name, email) values
  ('11111111-1111-1111-1111-111111111111', 'E2E Active Co', 'active@ultraquote.test');

-- Expired tenant: subscription_end far in the past -> access state "expired".
insert into public.tenants (id, name, email, subscription_start, subscription_end, subscription_term)
values
  ('22222222-2222-2222-2222-222222222222', 'E2E Expired Co', 'expired@ultraquote.test',
   '2020-01-01', '2020-02-01', 'monthly');

-- Default settings rows (tax rate, prefix, valid days, etc. fall back to defaults).
insert into public.tenant_settings (tenant_id, default_tax_rate) values
  ('11111111-1111-1111-1111-111111111111', 8.5),
  ('22222222-2222-2222-2222-222222222222', 0);

-- A catalog category + product (+ default pricing tier) for the active tenant,
-- so the "add from catalog" flow in the quote editor has something to find.
insert into public.product_categories (id, tenant_id, name, sort_order) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Managed Services', 0);

insert into public.products
  (id, tenant_id, category_id, name, description, item_type, billing_period, unit,
   unit_cost, unit_price, setup_price, is_taxable, is_active, source)
values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Managed Workstation',
   'Per-seat managed endpoint with monitoring and patching.',
   'Service', 'Monthly', 'seat', 35.00, 75.00, 25.00, true, true, 'manual');

insert into public.product_pricing_tiers
  (product_id, tier_name, unit_cost, unit_price, is_default, sort_order)
values
  ('44444444-4444-4444-4444-444444444444', 'Standard', 35.00, 75.00, true, 0);

-- A client for the active tenant.
insert into public.clients (id, tenant_id, company_name, contact_name, contact_email) values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111',
   'Globex Corporation', 'Hank Scorpio', 'hank@globex.test');
