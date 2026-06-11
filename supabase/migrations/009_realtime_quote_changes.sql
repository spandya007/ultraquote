-- 009: Realtime live-refresh support for open quote editors
-- Streams quote/scenario/line-item changes to subscribed clients so a teammate's
-- saves (and webhook status flips, e.g. signed) appear without a reload.
-- Presence ("X is also in this quote") needs NO database config — only this
-- postgres_changes feed does.
--
-- Realtime respects RLS: subscribers only receive rows their SELECT policies
-- allow (tenant-scoped via current_tenant_id()).

-- Add the tables to the Realtime publication (idempotent).
do $$ begin
  alter publication supabase_realtime add table public.quotes;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.quote_scenarios;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.quote_line_items;
exception when duplicate_object then null; end $$;

-- DELETE events normally carry only the primary key. The client filters
-- line-item events by scenario_id (they have no quote_id column) and scenario
-- events by quote_id, so deletes need the full old row.
alter table public.quote_scenarios  replica identity full;
alter table public.quote_line_items replica identity full;
