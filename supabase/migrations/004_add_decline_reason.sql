-- Captures the reason a signer gives when declining (DocuSeal form.declined →
-- decline_reason). Run in the Supabase SQL editor BEFORE deploying the webhook
-- change that writes it.
alter table public.quote_signers
  add column if not exists decline_reason text;
