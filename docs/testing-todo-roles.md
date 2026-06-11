# Testing TODO — Roles & Quote Ownership (built 2026-06-10, not yet tested)

Feature: `docs/roles-permissions-design.md` · Code through commit `d06b0de`.
Test on **localhost** (`npm run dev`) — the live Netlify site doesn't have this
code yet. You'll want two browser windows: your normal one (owner,
`sameer@cmithayward.com`) and an incognito one (member, `sales@cmithayward.com`).

## Step 0 — REQUIRED before anything else

- [ ] Run **`supabase/migrations/008_quote_ownership_rls.sql`** in the Supabase
      SQL editor (whole file, one go). Until this runs, **creating any quote
      fails** — the app now allocates quote numbers via the `next_quote_number()`
      function this migration creates.
- [ ] Sanity check after running: open the app as yourself, create a quote,
      confirm it gets a number and opens normally.

## 1 — Quote ownership (the core)

As **member** (incognito):
- [ ] Create a new quote → works; you can edit everything as usual.
- [ ] Quotes list shows a **Created by** column; your quote shows your name.
- [ ] Open one of the **owner's** quotes → amber **"Read-only — created by …"**
      banner; title/scenarios/line items/right panel all disabled; **Send**
      button absent; Document tab locked (no toolbar, can't type).
- [ ] **Preview** and **Download PDF** still work on that read-only quote.
- [ ] Click **Duplicate** in the amber banner → lands in an editable copy
      ("(Copy)" title, fresh quote number) owned by the member.
- [ ] Pre-existing quotes (created before today) show the owner as creator and
      open read-only for the member (expected: backfill assigned them to you).

As **owner** (normal window):
- [ ] Open the member's quote → fully editable (no banner). Owner overrides.

## 2 — Owner-only areas (test as member)

- [ ] **Products**: no "Add Product" / "Import CSV" buttons; clicking a product
      opens a view-only "Product Details" drawer (no Save).
- [ ] **Document tab → no "Extract pricing"** button on the member's own quote
      (owner-only). Ask AI / Import / Templates still available on their own quote.
- [ ] **Clients**: "Add Client" works (create a throwaway test client);
      clicking an *existing* client opens view-only "Client Details" (no
      Save/Deactivate).
- [ ] **Settings**: Company Settings + Quote Defaults greyed out with the
      "view only" note; Team card shows the list without invite/revoke controls.

## 3 — Templates

- [ ] As member: save their own quote's document as a template → appears on
      /templates with "by <member>"; member can rename/edit/delete it.
- [ ] As member: an owner-created template shows **View** (not "Open editor");
      opening it is read-only; no delete button on the card.
- [ ] As member: **apply** the owner's template to their own quote → works.
- [ ] As owner: can edit/delete the member's template (owner override).

## 4 — Quick visual checks

- [ ] Sidebar: "Hello, Sameer 👋" (and "Hello, Sales" for the member).
- [ ] Settings → Team: green **active** badges; owner row shows owner + active.

## 5 — RLS backstop (optional, 2 min, proves DB-level security)

In the SQL editor, impersonating nothing (just checking policies exist):
- [ ] `select policyname from pg_policies where tablename = 'quotes';` →
      4 rows (select/insert/update/delete variants), not the old single
      "own tenant only".
Or simply: as member, open a read-only quote, pop devtools → try editing a
disabled field via the console if you're feeling thorough — the UPDATE will
affect 0 rows.

## Known/expected behaviors (not bugs)

- All pre-migration quotes/templates belong to the **owner** (backfill).
- A member's "Profit margins" toggle on a read-only quote works but doesn't
  persist (view preference only).
- Members can still *see* everything in the tenant (read access is
  tenant-wide by design) — restriction is on *writing*.

## After testing passes

- [ ] Tick off backlog #14 as verified in CLAUDE.md (and delete this file or
      mark it done).
- [ ] When ready to take it live: Netlify → un-stop builds → Trigger deploy
      (livesite is still pre-Discount!), and consider bumping the Supabase
      Auth email rate limit before onboarding real tenants.
