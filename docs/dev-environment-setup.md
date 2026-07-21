# Dev / Test Environment Setup

Stand up a **separate Supabase project for dev/test** so local development stops
writing to production data. ~30–45 min, one-time.

## Why

Today `.env.local` points at the **production** Supabase project
(`pibipcdkxtldjbrsdbua`). So every "localhost test" — invited tenants (Pandya's),
test products, password resets — lands in **prod**. A separate dev project
isolates that: localhost → dev project, Netlify → prod project.

**Cost:** Supabase grants **2 active free projects**, so a dedicated dev project
is **$0**. ⚠️ Free projects **auto-pause after ~1 week of inactivity** — just
un-pause from the dashboard when you return. (When prod later moves to Pro, keep
the dev project in a *separate Free-Plan org* to retain the 2-free-projects perk.)

---

## Step 1 — Create the dev Supabase project

1. supabase.com/dashboard → **New project** (a Free-Plan org is fine).
2. Name it clearly, e.g. **ultraquote-dev**. Pick a region + a strong DB password.
3. Wait for it to provision (~2 min).

## Step 2 — Apply the schema

Dev project → **SQL Editor → New query** → paste the **entire**
`supabase/schema.sql` → **Run**. This builds all 16 tables, RLS policies,
functions, the `proposal-assets` storage bucket, and the realtime publication —
i.e. the full current schema (already includes migrations 001–009).

> `schema.sql` is the consolidated source of truth. The numbered files in
> `supabase/migrations/` are **incremental** changes for an *existing* DB (prod) —
> you don't need them on a fresh project.

## Step 3 — Create the dev owner + seed data

1. Dev project → **Authentication → Users → Add user**: your dev login
   (e.g. `sameer@cmithayward.com` + a password). Turn **Auto Confirm User ON**.
2. Copy that user's **UID**.
3. SQL Editor → paste `supabase/seed-dev.sql`, replace the placeholder UID on the
   `v_owner uuid := '…'` line with the copied UID → **Run**. This provisions a
   `CMIT Hayward (DEV)` tenant, makes you a platform admin (so `/admin` works),
   and adds a few sample products.

## Step 4 — One-time auth/config (per environment)

In the **dev** project's dashboard:

- **Authentication → URL Configuration → Redirect URLs:** add
  `http://localhost:3000/auth/set-password` (and `http://localhost:3000/**` is
  a convenient catch-all). Needed for invite + password-reset links.
- **SMTP (optional for dev):** the built-in Supabase mailer (rate-limited) is
  fine for dev invite/reset testing. Only wire Zoho SMTP here if you want to
  exercise branded emails in dev too.
- **Password policy:** set **Minimum password length = 12**, leave Password
  Requirements at **None** (matches the app — see backlog #17 decision).
- **Storage:** the `proposal-assets` bucket is created by `schema.sql`; no action.
- **DocuSeal (optional for dev):** the Send flow needs `DOCUSEAL_API_TOKEN` +
  a webhook. Leave unset in dev unless testing signing; the rest of the app works
  without it.

## Step 5 — Repoint `.env.local` at dev

⚠️ **Before editing, copy your current `.env.local` to `.env.local.prod.bak`** so
you keep the prod values (Netlify already has them set in its dashboard, so prod
is unaffected by local changes — but keep a backup anyway).

From the **dev** project → **Project Settings → API**, copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

Leave the rest as-is for now (`GEMINI_API_KEY`, `PDF_SERVICE_*`, `DOCUSEAL_*`,
`NEXT_PUBLIC_APP_URL=http://localhost:3000`). Per-env Gemini/DocuSeal keys are
ideal later, but one key works to start.

## Step 6 — Verify

```
npm run dev
```
- Log in as the dev owner → you should land in **CMIT Hayward (DEV)** with the
  sample products visible and a **Platform Admin** link in the sidebar.
- Create a quote (number should be `QUOTE-2026-001` — fresh sequence).
- Confirm in the **prod** Supabase dashboard that **nothing new appeared** there.

---

## Ongoing discipline (important)

- **New DB changes go to BOTH projects.** When you add a migration, run it on
  dev first (test), then on prod, and keep `schema.sql` in sync (the repo
  convention). The `migrations/` folder is the ordered history for prod.
- **Prod env lives in Netlify** (dashboard → Site settings → Environment
  variables), pointing at the prod Supabase project. `.env.local` is dev-only.
- **Free dev project pauses after ~1 week idle** — un-pause from the dashboard.
- Consider a hosted **staging** later: a Netlify branch-deploy pointing at the
  dev project. Localhost-against-dev is enough to start.
- **MFA / TOTP (backlog #18) should be built/tested here in dev first** — never
  iterate enroll/disable cycles against prod logins.

## Environment matrix

| | **Dev / Test** | **Prod** |
|---|---|---|
| Supabase project | ultraquote-dev (new, free) | `pibipcdkxtldjbrsdbua` |
| App | `npm run dev` (localhost:3000) | Netlify (app.smartprops.io) |
| Env source | `.env.local` | Netlify env vars |
| SMTP | built-in (or Zoho) | Zoho |
| DocuSeal | sandbox / off | sandbox (→ prod key before real clients) |
| Gemini | shared key (→ per-env later) | shared key |
| Free-project pause | yes (un-pause when idle) | n/a |
