-- Per-line-item discount (%). Line totals, tax, and margins compute on the
-- discounted price; client-facing tables show the discount + savings.
-- Run in the Supabase SQL editor BEFORE using the Discount column.

alter table public.quote_line_items
  add column if not exists discount_percent decimal(5,2) not null default 0;

-- Recreate the stored generated columns so they account for the discount.
alter table public.quote_line_items drop column if exists line_total;
alter table public.quote_line_items
  add column line_total decimal(10,2)
    generated always as (quantity * unit_price * (1 - discount_percent / 100)) stored;

alter table public.quote_line_items drop column if exists margin_percent;
alter table public.quote_line_items
  add column margin_percent decimal(5,2)
    generated always as (
      case when unit_price * (1 - discount_percent / 100) > 0
        then ((unit_price * (1 - discount_percent / 100) - unit_cost)
              / (unit_price * (1 - discount_percent / 100))) * 100
        else null end
    ) stored;
