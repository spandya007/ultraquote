-- 010: tenants.contact_name
-- The Company Settings page (settings-client.tsx saveProfile) writes
-- tenants.contact_name, and the quote page/serializer read it, but the column
-- was never in schema.sql — it existed on PROD (added manually, pre-migrations)
-- yet was MISSING on any fresh project built from schema.sql (e.g. the new dev
-- project), so saving Company Settings failed there with
-- "column tenants.contact_name does not exist".
--
-- Idempotent: no-op on prod (already present), adds the column on dev.

alter table public.tenants add column if not exists contact_name text;
