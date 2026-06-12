-- ════════════════════════════════════════════════════════════════════════════
-- DEV/TEST SEED — run ONCE on a fresh dev Supabase project, AFTER schema.sql.
-- ════════════════════════════════════════════════════════════════════════════
-- Prereq: in the dev project's dashboard, Authentication → Users → Add user,
-- create your dev owner login (email + password, "Auto Confirm User" ON), then
-- copy its UID and paste it on the v_owner line below. See
-- docs/dev-environment-setup.md.
--
-- Seeds: one tenant (+ settings + 6 categories via provision_tenant), makes you
-- a platform admin (so /admin works in dev), and a few sample products.
-- NOT idempotent — run once on an empty project.
-- NOTE: plain SQL only (the Supabase SQL editor doesn't support psql \set).

-- ── 1. Tenant + owner + platform admin (paste the UID on the v_owner line) ──
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-000000000000';  -- ← PASTE dev owner Auth UID
begin
  perform public.provision_tenant(
    'CMIT Hayward (DEV)',          -- tenant name (DEV suffix to avoid confusion)
    'sameer@cmithayward.com',      -- tenant contact email
    v_owner,                       -- owner Auth UID
    'sameer@cmithayward.com',      -- owner login email (match the Auth user)
    'Sameer Pandya'                -- owner full name
  );

  insert into public.platform_admins (user_id)
  values (v_owner)
  on conflict (user_id) do nothing;
end $$;

-- ── 2. A few sample products so dev isn't empty (optional) ───────────────────
with t as (
  select id as tenant_id from public.tenants where name = 'CMIT Hayward (DEV)' limit 1
),
cat as (
  select c.name, c.id from public.product_categories c, t where c.tenant_id = t.tenant_id
)
insert into public.products
  (tenant_id, category_id, name, description, item_type, billing_period,
   unit_cost, unit_price, setup_price, is_taxable, source)
select t.tenant_id,
       (select id from cat where cat.name = p.cat),
       p.name, p.description, p.item_type, p.billing_period,
       p.cost, p.price, p.setup, p.taxable, 'manual'
from t,
  (values
    ('Managed Workstation Support', 'Per-workstation monitoring + helpdesk', 'Service',  'Monthly',  18.00,  45.00,   0.00, false, 'Managed Services'),
    ('Business Laptop 14in',        '16GB RAM, 512GB SSD',                   'Hardware', 'One Time', 1050.00, 1249.00, 0.00, true,  'Hardware'),
    ('Microsoft 365 Business Prem', 'Per-user license',                      'Software', 'Monthly',  22.00,  26.40,   0.00, false, 'Software'),
    ('Network Assessment',          'One-time audit + documentation',        'Service',  'One Time', 600.00, 1500.00, 250.00, true, 'Professional Services')
  ) as p(name, description, item_type, billing_period, cost, price, setup, taxable, cat);

-- Give each product a single default pricing tier (the app's pricing model).
insert into public.product_pricing_tiers
  (product_id, tier_name, unit_cost, unit_price, is_default, sort_order)
select pr.id, 'Default Pricing', pr.unit_cost, pr.unit_price, true, 0
from public.products pr
join public.tenants tn on tn.id = pr.tenant_id
where tn.name = 'CMIT Hayward (DEV)';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- select u.email, u.role, t.name from public.users u
--   join public.tenants t on t.id = u.tenant_id;
-- select count(*) from public.products;
