-- 022: Client Notes — per-quote INTERNAL interview notes (pain points, goals,
-- context from talking to the client). Feeds the AI proposal drafting
-- (/api/ai/draft) so the narrative targets the client's stated pain points.
-- NEVER rendered in the client-facing proposal / PDF (the serializer doesn't read
-- it). Distinct from quotes.notes (general internal notes in the right panel).
alter table public.quotes
  add column if not exists client_notes text;
