-- Phase 2 — Org Admin provenance
-- Records which Org Admin (if any) created a workspace, so the Platform Admin
-- gets a persistent visual "Added by Org Admin" badge in /admin (alongside the
-- email notification sent at creation time). NULL = created by the Platform
-- Admin / normal onboarding flow.
--
-- No org-level subscription fields here: per the Option-A decision, all
-- subscription dates stay with the Platform Admin until Stripe Phase 3.

alter table public.tenants
  add column if not exists created_by_org_admin_user uuid references auth.users(id) on delete set null;
. 