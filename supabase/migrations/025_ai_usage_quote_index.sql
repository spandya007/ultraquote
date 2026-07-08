-- Index for the per-quote AI hard cap: the enforcement guard counts
-- `ai_usage` draft_* rows by quote_id on every draft/outline call, so index it.
create index if not exists ai_usage_quote_kind_idx on public.ai_usage (quote_id, kind);
