-- Per-client logo (used by the {{client.logo}} document field).
-- Run in the Supabase SQL editor.
alter table public.clients
  add column if not exists logo_url text;
