-- Test seed for local RLS tests (NOT for cloud). Two isolated tenants, each with
-- an owner and a member, with fixed UUIDs the test harness references.
-- Applied by scripts/test-db-reset.sh after schema.sql + migrations 012/013.

insert into public.tenants (id, name) values
  ('00000000-0000-0000-0000-0000000000a0', 'Tenant A'),
  ('00000000-0000-0000-0000-0000000000b0', 'Tenant B');

insert into public.tenant_settings (tenant_id) values
  ('00000000-0000-0000-0000-0000000000a0'),
  ('00000000-0000-0000-0000-0000000000b0');

insert into public.users (id, tenant_id, email, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a0', 'owner@a.test',  'A Owner',  'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a0', 'member@a.test', 'A Member', 'member'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b0', 'owner@b.test',  'B Owner',  'owner'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b0', 'member@b.test', 'B Member', 'member');
