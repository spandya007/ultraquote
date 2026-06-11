# Roles, Quote Ownership & Permissions — Design

Status: **approved** (matrix + Q1–Q5 confirmed with user 2026-06-10)
Builds on the two-role model (`users.role`: `owner` | `member`) introduced with
tenant onboarding (`docs/tenant-onboarding-design.md`).

## Confirmed decisions

- **Q1 — Clients are add-only for members.** Members can create new clients
  (needed to create quotes for new prospects) but cannot edit or delete
  existing ones (an edit to a shared client would silently change everyone's
  quotes). Owner can do everything.
- **Q2 — Any member may duplicate any quote.** The copy (including scenarios +
  line items) becomes the duplicator's own quote; the original is untouched.
  This is the pricing-preserving reuse path; save-to-template remains the
  narrative-only path.
- **Q3 — Backfill.** Existing quotes/templates get `created_by` = the tenant's
  owner.
- **Q4 — "Extract pricing" is owner-only.** The toolbar button is hidden for
  members and the API routes refuse non-owners (it can create catalog
  products, which are owner-only).
- **Q5 — Only the creator (and the tenant owner) can edit a quote.**

## Permission matrix

Roles: **Owner** = tenant owner · **Creator** = member who created the item ·
**Member** = any other member of the same tenant.

| Resource / action | Owner | Creator | Other member |
|---|---|---|---|
| Quote — view, Preview, download PDF | ✅ | ✅ | ✅ read-only |
| Quote — create new | ✅ | n/a | ✅ (becomes creator) |
| Quote — edit (fields, scenarios, line items, document, AI, import, apply template, toggles) | ✅ | ✅ | ❌ |
| Quote — send / re-send for signature | ✅ | ✅ | ❌ |
| Quote — duplicate | ✅ | ✅ | ✅ (copy becomes theirs) |
| Quote — delete | ✅ | ✅ | ❌ |
| Quote — save document as new Template | ✅ | ✅ | ✅ |
| Template — view, Apply, create-quote-from | ✅ | ✅ | ✅ |
| Template — create | ✅ | ✅ | ✅ |
| Template — rename/edit/soft-delete | ✅ | ✅ | ❌ |
| Products — search catalog, pull into quotes | ✅ | ✅ | ✅ |
| Products — add/edit/delete/CSV import/tiers | ✅ | ❌ | ❌ |
| Extract pricing (and create products from it) | ✅ | ❌ | ❌ |
| Clients — view | ✅ | ✅ | ✅ |
| Clients — add new | ✅ | ✅ | ✅ |
| Clients — edit/delete existing | ✅ | ❌ | ❌ |
| Settings — company profile / tax / quote defaults | ✅ | view-only | view-only |
| Settings — Team invites | ✅ | ❌ | ❌ |
| /admin console | platform admins only (independent of tenant role) |

Resolved corner cases: quotes list shows **Created by** so read-only isn't
mysterious; a departed member's quotes stay owner-editable (member removal is
out of scope); multiple owners each get full rights; the system-managed quote
status lifecycle and DocuSeal webhook (service role, bypasses RLS) are
unaffected; Dashboard stats stay tenant-wide.

## Enforcement: two layers

1. **Postgres RLS (real security)** — migration `008_quote_ownership_rls.sql`.
   The original single `for all using (tenant)` policies are split per command:
   reads stay tenant-wide, writes get ownership/role conditions. Helper:

   ```sql
   create function public.is_tenant_owner() returns boolean ... security definer
     -- select role = 'owner' from users where id = auth.uid()
   ```

   | Table | select | insert | update / delete |
   |---|---|---|---|
   | quotes | tenant | tenant + `created_by = auth.uid()` | creator or owner |
   | quote_scenarios / line_items / signers / sessions | via tenant quote | via editable quote (creator/owner) | via editable quote |
   | templates | tenant | tenant + `created_by = auth.uid()` | creator or owner |
   | products / pricing_tiers / categories | tenant | owner | owner |
   | clients | tenant | tenant (any member) | owner |
   | tenants | own | — | owner |
   | tenant_settings | tenant | owner | owner |
   | users | tenant | — (trigger/service) | own row, or owner |

2. **UI affordances** — read-only modes so users aren't shown controls that
   would fail:
   - Quote editor: `canEdit` computed server-side (creator or owner) →
     read-only banner ("Created by X — read-only"), all inputs disabled,
     auto-save suspended, BlockNote `editable:false`, Send/AI/Import/Apply
     hidden. Preview + Download PDF remain.
   - Quotes list: Created-by column; Duplicate for everyone; Delete (if shown)
     creator/owner only.
   - Templates: Apply for everyone; Open-editor/rename/delete only creator or
     owner (editor read-only otherwise).
   - Products: members get a read-only table + drawer (no Add/Import/save).
   - Clients: members get Add but drawers open read-only for existing clients.
   - Settings: forms disabled for members (Team card already owner-gated).
   - "Extract pricing" toolbar button: owner only (Q4).

## Schema changes (migration 008)

- `quotes.created_by uuid references public.users(id) on delete set null`
- `templates.created_by uuid references public.users(id) on delete set null`
- Backfill both: the tenant's owner (`role='owner'`, oldest if several).
- `is_tenant_owner()` helper + full RLS policy rewrite per the table above.

## API route changes

- `POST /api/quotes` — sets `created_by` = caller (required by RLS insert check).
- `POST /api/quotes/[id]/duplicate` — copy gets `created_by` = caller (any
  member may duplicate, per Q2).
- `POST /api/ai/extract-pricing` + `/api/quotes/[id]/apply-pricing` — require
  tenant owner (Q4); RLS on `products` is the backstop.
- Send/scenario/line-item writes need no route changes — they run on the
  session client, so the new RLS gates them automatically.

## Out of scope (future)

- Removing/offboarding users; reassigning a departed member's quotes.
- Role changes (promote member → owner) from the UI.
- Per-quote sharing/collaborators beyond creator+owner.
- Client merge/dedup tooling (related to add-only clients).
