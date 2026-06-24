-- 018_tenant_deletion_schedule.sql
-- Scheduled tenant deletion (platform-admin only). A tenant is marked for
-- deletion with a future date; it stays fully usable during the grace window
-- (so the owner can export), shows a warning, and is purged after the date by
-- the deletion runner. Clearing the column cancels the deletion.
--
-- Purge itself (Storage assets + Auth users + the tenants row, which cascades
-- all child rows) is done by the app via the service-role + GoTrue admin API —
-- not by SQL — so no policy/trigger is needed here.

alter table public.tenants
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists deletion_requested_by uuid,   -- platform admin's auth uid
  add column if not exists deletion_reason       text;

create index if not exists tenants_deletion_scheduled_at_idx
  on public.tenants (deletion_scheduled_at)
  where deletion_scheduled_at is not null;
