-- Clients: add a Secondary Contact (primarily to collect a second signature) and
-- break the free-text address into standard structured fields. All additive +
-- nullable; the legacy `address` column is KEPT as a fallback so existing data is
-- never lost (proposals compose the structured fields when present, else fall back
-- to `address`). Idempotent.

alter table public.clients
  -- Secondary contact (second signer / point of contact)
  add column if not exists secondary_contact_name  text,
  add column if not exists secondary_contact_email  text,
  add column if not exists secondary_contact_phone  text,
  -- Structured address (6 standard fields). `address` (free text) is retained.
  add column if not exists address_street   text,
  add column if not exists address_suite    text,
  add column if not exists address_city     text,
  add column if not exists address_state    text,
  add column if not exists address_postal   text,
  add column if not exists address_country  text;
