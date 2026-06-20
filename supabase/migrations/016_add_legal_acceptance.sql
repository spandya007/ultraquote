-- 016: record each user's acceptance of the Legal Terms (Terms of Service +
-- Privacy Policy). NULL = not yet accepted → the dashboard gate requires
-- acceptance before use. Idempotent.
alter table public.users add column if not exists legal_accepted_at timestamptz;
