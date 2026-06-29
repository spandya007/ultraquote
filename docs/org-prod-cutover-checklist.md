# UltraQuote — Organizations: Prod Cutover Checklist

> Operational runbook for rolling the Organizations / Org Admin feature **and** the new identity structure
> to Prod, after Dev sign-off. Prod IDs differ from Dev — **always look them up on Prod** (don't reuse Dev
> UUIDs). Background: `docs/organizations-white-label-design.md`, `docs/platform-admin-guide.md`.

## Target identity structure
| Hat | Login | Table |
|---|---|---|
| Platform Admin | `sameer@ultraedge.us` | `platform_admins` |
| Org Admin (CMIT) | `sameer@cmithayward.com` | `organization_admins` |
| Owner (CMIT Hayward) | `spandya@cmitsolutions.com` | `users` (role=owner) |

## 0. Prereqs
- [ ] All Dev testing green (Phase 1 + 2 + the 3-login dogfood).
- [ ] Migrations **019 + 020 already run on Prod** (done 2026-06-28). Confirm columns exist:
      `select organization_id, created_by_org_admin_user from public.tenants limit 1;`

## 1. Deploy code FIRST
- [ ] Commit + push the Organizations work to `main` → Netlify auto-deploys to Prod.
- [ ] **Do this before any Prod identity change** — the "pure Platform/Org Admin → console" redirect and
      the `/admin` + `/org` Sign-out buttons must be live, or a no-workspace login hits "Access disabled".
- [ ] Smoke-test Prod `/admin` still loads as the current admin (`sameer@cmithayward.com`).

## 2. Platform Admin swap (Script 1)
- [ ] Supabase Dashboard (Prod) → Authentication → **Add user** `sameer@ultraedge.us` (password, auto-confirm).
- [ ] `insert into public.platform_admins (user_id) select id from auth.users where lower(email)='sameer@ultraedge.us' on conflict do nothing;`
- [ ] **Verify**: log in as `sameer@ultraedge.us` → lands on `/admin`.
- [ ] Only then: `delete from public.platform_admins where user_id in (select id from auth.users where lower(email)='sameer@cmithayward.com');`

## 3. Organizations (UI)
- [ ] As `sameer@ultraedge.us` → `/admin` → Organizations → **New organization** "CMIT".
- [ ] Add **CMIT Hayward** to it (dropdown of existing standalone workspaces).
- [ ] Note the **Prod CMIT org id**: `select id, name from public.organizations;`
- [ ] Note the **Prod CMIT Hayward tenant id**: `select id, name from public.tenants where name ilike '%hayward%';`

## 4. Org Admin (Script 2)
- [ ] `insert into public.organization_admins (org_id, user_id) select '<PROD-CMIT-org-id>'::uuid, u.id from auth.users u where lower(u.email)='sameer@cmithayward.com' on conflict do nothing;`
- [ ] Verify `/org` loads + lists CMIT Hayward (since `sameer@cmithayward.com`'s platform-admin hat was removed in step 2, it now lands on `/org` if it has no workspace row yet — but it's still the Owner here, so it's dual-hat → reaches `/org` via the sidebar link).

## 5. Owner transfer (Script 3)
- [ ] Invite `spandya@cmitsolutions.com` into CMIT Hayward (Settings → Team or `/admin`) → accept.
- [ ] Promote spandya to owner, demote `sameer@cmithayward.com` to member, then delete its `users` row
      (scoped to the **Prod** CMIT Hayward tenant id). See Script 3 in the chat / design notes.
- [ ] Verify: `sameer@cmithayward.com` now lands on `/org` (pure Org Admin, no workspace access).

## 6. Refresh company contact email (per transferred workspace) ⭐
- [ ] **`tenants.email` (the company Contact Email in Settings) does NOT auto-update on ownership transfer**
      — it keeps the value stamped at provisioning (e.g. `sameer@cmithayward.com`). It's read-only to
      tenants (migration 013), so the **Platform Admin** must update it.
- [ ] For each transferred workspace, set the correct business contact email:
      `update public.tenants set email='<business-contact-email>' where id='<PROD-tenant-id>';`
      (or `/admin` → Manage tenant → edit company details). Also sanity-check `contact_name`.

## 7. Final verification (all three logins on Prod)
- [ ] `sameer@ultraedge.us` → `/admin` (Platform Admin).
- [ ] `sameer@cmithayward.com` → `/org` (CMIT Org Admin; can suspend/invite workspaces, no quote/pricing access).
- [ ] `spandya@cmitsolutions.com` → CMIT Hayward dashboard (Owner); Company Settings shows the corrected contact email.
