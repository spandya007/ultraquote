-- Adds the per-document header/footer toggle to quotes.
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query).
alter table public.quotes
  add column if not exists include_header_footer boolean not null default true;
