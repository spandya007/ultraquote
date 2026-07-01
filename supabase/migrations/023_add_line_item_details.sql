-- Per-line-item long description ("details"), shown indented under the item name
-- in the Pricing Scenarios table and in the client-facing proposal/PDF. Snapshotted
-- from the catalog product's description at add-time (like price/setup); editable;
-- free-text items start blank. Additive + nullable — no RLS/policy changes.
alter table public.quote_line_items
  add column if not exists details text;
