-- 021: Business / brand-voice profile for AI proposal drafting.
-- De-hardcodes the "MSP" author role so the tool fits any vertical. Per-tenant
-- fields + org-level defaults; the tenant value overrides the org default
-- (resolution in lib/ai/brand-profile.ts). All nullable → existing tenants keep
-- working with a neutral fallback until they fill these in.
-- See docs/brand-voice-profile-design.md.

-- Per-workspace (tenant) profile — set by the tenant owner in Settings.
alter table public.tenant_settings
  add column if not exists business_type  text,   -- one line, replaces "MSP" in the role
  add column if not exists business_about text,    -- differentiators / what we do
  add column if not exists brand_voice    text;    -- tone/style guidance

-- Org-wide defaults — set by the Org Admin in /org; inherited by member
-- workspaces unless overridden at the tenant level.
alter table public.organizations
  add column if not exists default_business_type  text,
  add column if not exists default_business_about text,
  add column if not exists default_brand_voice    text;
