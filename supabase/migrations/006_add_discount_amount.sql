-- Discounts can now be a fixed dollar amount (off the line total) OR a percent.
-- The UI keeps them mutually exclusive per line. Generated columns recreated to
-- apply: net = max(qty*price*(1-pct/100) - amount, 0).
-- Run in the Supabase SQL editor BEFORE using the $ discount option.

alter table public.quote_line_items
  add column if not exists discount_amount decimal(10,2) not null default 0;

alter table public.quote_line_items drop column if exists line_total;
alter table public.quote_line_items
  add column line_total decimal(10,2)
    generated always as (
      greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0)
    ) stored;

alter table public.quote_line_items drop column if exists margin_percent;
alter table public.quote_line_items
  add column margin_percent decimal(5,2)
    generated always as (
      case when greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0) > 0
        then ((greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0)
               - quantity * unit_cost)
              / greatest(quantity * unit_price * (1 - discount_percent / 100) - discount_amount, 0)) * 100
        else null end
    ) stored;
