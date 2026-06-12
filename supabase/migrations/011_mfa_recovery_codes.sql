-- 011: MFA recovery codes
-- Supabase MFA (TOTP) is native, but recovery codes are NOT — we store our own.
-- One row per generated code (SHA-256 hash; the plaintext is shown to the user
-- exactly once at generation). Service-role only: RLS enabled with NO policies,
-- so only /api/mfa/* routes (service key) can read/write.

create table public.mfa_recovery_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id);

alter table public.mfa_recovery_codes enable row level security;
-- no policies → service-role only
