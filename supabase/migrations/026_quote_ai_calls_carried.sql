-- Carried-forward AI draft budget. When a quote is duplicated, the copy inherits
-- the source's used draft-call count here, so duplicating can't reset the per-quote
-- AI cap (the enforcement adds this to the quote's logged draft_* rows).
alter table public.quotes
  add column if not exists ai_draft_calls_carried integer not null default 0;
