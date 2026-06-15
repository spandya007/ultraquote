# Subscription & Access Lifecycle — Design

> Design doc (2026-06-13). Proposes the tenant subscription model, expiry reminders, and the two
> enable/disable "kill switches" (platform→tenant, tenant→user) requested for UltraQuote. **No code
> written yet** — this is the blueprint for the build, plus a draft of the Help content for tenant
> owners. Billing/charging math is explicitly **out of scope** (a later layer that consumes this data).
>
> **Your inputs are locked in §11 and woven throughout:** expiry → a **7-day read-only grace** then
> hard block; **subscription dates are platform-admin-only** for v1; reminders are an **in-app banner
> only** (email deferred); enforcement is **request-layer now, RLS as a fast-follow**.

---

## 1. Goals (restated)

1. **Subscription window per tenant** — a start date (defaults to today) and an end date set via a
   **term picker** (Monthly / Quarterly / Yearly) so the system computes the end date; a manual
   "Custom" date is also allowed.
2. **Expiry reminder** — when the end date is within **7 days**, warn the tenant.
3. This sets up **charging later** (calculations done separately — we just need accurate dates + seats).
4. **Adding a user mid-subscription** must not create end-date ambiguity — needs a clean rule.
5. **Platform kill switch** — *I* (platform admin) can disable a whole tenant regardless of its
   subscription end date.
6. **Tenant kill switch** — a tenant owner can disable one or more of *their* users regardless of the
   subscription end date.

The unifying concept: a **Subscription** at the tenant level, plus an **Enable/Disable flag** at two
levels (tenant, and tenant-user).

---

## 2. Core decisions (the important ones up front)

### D1 — Subscription lives at the TENANT level; seats are co-terminous (solves requirement #4)

A tenant has **one** subscription window. **Every user under the tenant shares that same window** —
their access ends when the *tenant's* subscription ends. We do **not** give each user their own
end date.

When the owner adds a new user mid-cycle:
- The new user simply **inherits the tenant's existing `subscription_end`** (co-terminous). No new
  date to pick, no per-user expiry to reconcile.
- For *billing*, the user's `created_at` is the proration anchor — the charging layer (separate) can
  prorate "X days of a seat" from when the user was added to the tenant's period end. We store the
  date; we don't compute money here.

**Why this is the clean answer:** the alternative — per-user subscription windows — creates exactly
the "issues with the end date" the requirement worries about: N independent expiries to track,
reminders to fan out, renewals that drift out of sync, and a confusing "my seat expired but the
company's didn't" state. Co-terminous seats collapse all of that into one date the owner and platform
both reason about. This is also how Microsoft 365 / Google Workspace / most SaaS seat models work:
add a seat → it bills prorated to the common renewal date.

> **Renewal carries seats forward automatically.** When the platform admin extends/renews the
> tenant's `subscription_end`, all active seats move with it — nothing per-user to touch.

### D2 — Three independent access conditions, resolved to one effective state

Access is the AND of three reversible conditions — platform switch, subscription window, user switch.
But expiry is **not** a binary cliff: per the locked decision there is a **read-only grace period**
(`GRACE_DAYS = 7`, a single constant) after `subscription_end` before a hard block. So the resolver
returns one of five states:

| State | Condition | Effect |
|---|---|---|
| `suspended` | `platform_enabled = false` | Hard block, all users incl. owner. |
| `user_disabled` | `users.enabled = false` (member) | Hard block, that user only. |
| `expired` | `today > subscription_end + GRACE_DAYS` | Hard block; owner sees "contact UltraQuote to renew". |
| `grace` | `subscription_end < today ≤ subscription_end + GRACE_DAYS` | **Read-only**: can view, cannot create/edit/send. Red banner. |
| `ok` | none of the above (incl. `subscription_end` NULL) | Full access. |

**Precedence (most-authoritative first):** `suspended` → `user_disabled` → `expired` → `grace` → `ok`.
So a disabled member of an expired tenant sees the disabled message, not the expiry one.

Each underlying condition is a reversible boolean/date — no destructive action, no data deletion.

**Read-only `grace` mechanics:** the API **write guard** (`requireActiveAccess`) is the authoritative
enforcement — it allows reads but **403s all mutations** when state is `grace` (or worse). The UI is
cosmetic on top: a global red banner + hiding primary "create/new/send" actions. Exhaustively
disabling every input is best-effort/phase-2; the server write-block is what actually enforces
read-only.

### D3 — The owner can never be disabled by the tenant kill switch, nor disable themselves

The tenant→user switch (req #6) can target **members only**. The owner seat is governed solely by the
platform switch + subscription. This prevents a tenant from locking itself out of its own admin.
(Platform admin can still disable the entire tenant, owner included, via the platform switch.)

### D3b — A new tenant's dates are set at invite time; the clock starts on the invite-send date

When the platform admin invites a new tenant (the `/admin` "Invite tenant" flow →
`provision_tenant_shell()` → owner invite email), the **same form** captures the subscription:
- **Start date** — **defaults to and is fixed at the date the invite is sent** (today). This is a
  deliberate choice: billing/access start the moment the invite goes out, which *pressures the owner
  to log in and activate ASAP* rather than sit on the invite. (Editable by the admin if ever needed,
  but the default and intent is invite-send date.)
- **Term** — Monthly / Quarterly / Yearly / Custom. The system computes `subscription_end` from
  start + term (see §3). Custom = pick the end date directly.
- Leaving the subscription **blank** on the invite → `NULL` end → **Unlimited** (D4) — useful for an
  internal/demo tenant.

> The start is the **invite-send date, NOT the owner's acceptance/first-login date.** If the owner
> takes days to set their password, that time is *inside* the paid window — by design, to discourage
> delay. (Acceptance date is still recorded separately via `tenant_invites`, so the billing layer
> could revisit this later if ever wanted.)

**Example — invite "Acme IT" on 2026-06-13, term = Yearly:**

| Field | Value |
|---|---|
| `subscription_start` | `2026-06-13` (the invite-send date) |
| `subscription_term` | `yearly` |
| `subscription_end` | `2027-06-13` (start + 1 year) |
| `platform_enabled` | `true` |

Resulting timeline: active until 2027-06-13 → amber expiry banner from 2027-06-06 (≤7d) → read-only
**grace** 2027-06-14…2027-06-21 → hard block after 2027-06-21 until renewed. (Monthly → end
2026-07-13; Quarterly → 2026-09-13; Custom → admin-picked.)

### D4 — `subscription_end = NULL` means "no expiry" (grandfathering)

Existing tenants (and any the platform admin hasn't dated yet) get `NULL` end → treated as **active /
unlimited**, so shipping this feature locks nobody out. The platform admin opts a tenant into a dated
subscription explicitly.

### D5 — Enforce at the request layer now; harden into RLS as a fast-follow

- **v1 enforcement:** a shared server helper checked in the dashboard layout (exactly where the MFA
  AAL gate already sits) + in sensitive API routes. Fast to ship, mirrors an existing pattern.
- **Hardening (phase 2):** fold the access helpers into the RLS clauses so a blocked user with a
  still-valid JWT can't reach data by calling PostgREST directly. **Because grace is read-only, this
  needs two helpers, not one:** `user_can_read()` (true through the grace window) goes on `using`
  clauses of SELECT policies; `user_can_write()` (false during grace) goes on `with check` /
  INSERT-UPDATE-DELETE policies. Deferred because it touches many policies; the request-layer gate
  covers the normal UI path. (See §3 for the helper definitions.)

The `/admin` console runs in its **own layout guarded by `platform_admins`** and is **exempt** from
the tenant access gate — so the platform admin can always manage tenants even while their *own*
tenant is suspended/expired.

---

## 3. Data model (migration 012)

```sql
-- Tenant subscription + platform kill switch
alter table public.tenants
  add column if not exists subscription_start date,
  add column if not exists subscription_end   date,
  add column if not exists subscription_term   text
       check (subscription_term in ('monthly','quarterly','yearly','custom')),
  add column if not exists platform_enabled    boolean not null default true,
  add column if not exists suspended_at        timestamptz,   -- audit: when platform switch last set off
  add column if not exists suspended_reason    text;          -- optional note shown in /admin

-- Tenant → user kill switch
alter table public.users
  add column if not exists enabled      boolean not null default true,
  add column if not exists disabled_at  timestamptz,          -- audit
  add column if not exists disabled_by  uuid references public.users(id);

-- Backfill existing tenants: active, unlimited (NULL end), seeded start = created date
update public.tenants
   set subscription_start = coalesce(subscription_start, created_at::date)
 where subscription_start is null;
```

**Term → end-date computation** is done in app code at set-time (and re-applied on renewal), then the
concrete `subscription_end` is stored. We store the *computed date*, not a rule, so reminders and
gates are a simple date comparison:
- monthly → `start + interval '1 month'`
- quarterly → `start + interval '3 months'`
- yearly → `start + interval '1 year'`
- custom → admin picks the end date directly.

(Doing the math in code, not as a generated column, keeps "Custom" and manual nudges trivial. Could
also expose a `tenant_set_subscription(tenant, start, term, custom_end)` SQL function if we prefer
the math server-side — optional.)

**SQL helpers for the phase-2 RLS hardening (define now, wire into policies later).** Grace is
read-only, so we need a **read** helper (true through the grace window) and a **write** helper (false
during grace). `GRACE_DAYS` is hardcoded here as `7` to match the app constant — keep them in sync
(or read from a single config row later).

```sql
-- READ allowed: platform on AND not past (end + grace).  NULL end = unlimited.
create or replace function public.tenant_can_read(t uuid)
returns boolean language sql stable security definer as $$
  select coalesce(platform_enabled, true)
     and (subscription_end is null
          or subscription_end + interval '7 days' >= current_date)
  from public.tenants where id = t
$$;

-- WRITE allowed: platform on AND not yet expired (no grace for writes).
create or replace function public.tenant_can_write(t uuid)
returns boolean language sql stable security definer as $$
  select coalesce(platform_enabled, true)
     and (subscription_end is null or subscription_end >= current_date)
  from public.tenants where id = t
$$;

create or replace function public.user_can_read(u uuid)
returns boolean language sql stable security definer as $$
  select coalesce(usr.enabled, true) and public.tenant_can_read(usr.tenant_id)
  from public.users usr where usr.id = u
$$;

create or replace function public.user_can_write(u uuid)
returns boolean language sql stable security definer as $$
  select coalesce(usr.enabled, true) and public.tenant_can_write(usr.tenant_id)
  from public.users usr where usr.id = u
$$;
```

The `getAccessState` resolver (§4) is the single source of truth in v1; these helpers mirror the same
logic in SQL for the phase-2 hardening so the two layers can't drift.

---

## 4. Access enforcement (v1)

A single resolver, used everywhere:

```ts
// lib/access/access-state.ts
const GRACE_DAYS = 7;

type AccessState =
  | { status: "ok";            tenantId: string; role: "owner" | "member"; subscriptionEnd: string | null }
  | { status: "grace";         tenantId: string; role: "owner" | "member"; graceEndsOn: string }  // read-only
  | { status: "suspended" }       // platform switch off
  | { status: "expired"; role }   // past subscription_end + GRACE_DAYS
  | { status: "user_disabled" };  // users.enabled = false

export async function getAccessState(userId: string): Promise<AccessState>;
```

- **Dashboard layout** (`app/(dashboard)/layout.tsx`): after the existing MFA gate, call
  `getAccessState`:
  - `suspended` / `expired` → `redirect()` to `/account/suspended` (copy varies by reason + role;
    owner on `expired` gets "contact UltraQuote to renew").
  - `user_disabled` → `redirect()` to `/account/disabled`.
  - `grace` → **allow through** but pass a `readOnly` flag into the page tree (banner + hidden
    create actions); writes are blocked at the API layer.
  - `ok` → normal.
  The block pages live **outside** the gated area (like `/auth/*`) and offer Sign out.
- **Sensitive API routes** (quote create/edit, send, apply-pricing, team invite, etc.): call a
  `requireActiveAccess()` guard that **allows reads but 403s mutations** when state is `grace`, and
  403s everything when `suspended`/`expired`/`user_disabled`. Cheap insurance until RLS hardening.
- **`/admin`** is exempt (platform-admin layout guard only).

> Note: a user disabled *mid-session* keeps a valid JWT until their next server round-trip; the
> layout gate catches them on the next navigation/page load (server components re-run). Good enough
> for v1; RLS hardening closes the direct-API gap.

---

## 5. Expiry reminder (req #2)

**In-app banner (build now):**
- Server computes `daysToExpiry = subscription_end − today` in the dashboard layout and passes it to a
  dismissible `<SubscriptionBanner>` (client component, localStorage-dismissed per end-date so a new
  period re-arms it).
- Shown when `0 ≤ daysToExpiry ≤ 7`. Amber banner: *"Your UltraQuote subscription ends in N days
  (June 20). Contact UltraQuote to renew."* Owner sees the renew CTA; members see an FYI.
- A separate **expired** state (handled by the gate in §4) replaces the banner once past the date.

**Email reminder (optional fast-follow):** a scheduled job (Netlify scheduled function or a small
cron) that, once daily, finds tenants with `subscription_end` in exactly 7 / 3 / 1 days and emails the
owner via the existing **Zoho SMTP** path (reuse `lib/invites` mail plumbing / a Supabase function).
Listed as phase 2 so the visible reminder ships without standing up a cron.

---

## 6. Platform admin UI (req #1, #5) — `/admin`

**On the "Invite tenant" form (new-tenant dates, D3b):** add **Start date** (defaults to today =
invite-send date) + **Term** (Monthly/Quarterly/Yearly/Custom) → computed **End date** (editable;
blank = Unlimited). These are written onto the tenant shell at invite time so the subscription is
live from the moment the invite is sent. (`/api/admin/tenants/invite` extended to accept + persist
start/term/end alongside the existing provision-shell + email-invite steps.)

Per existing tenant row / detail, add a **Subscription** panel (platform-admin only):
- **Start date** (defaults to today), **Term** segmented control *Monthly / Quarterly / Yearly /
  Custom*. Picking a term auto-fills the computed **End date** (editable). "Custom" → free date pick.
- A **status badge**: `Active` · `Expiring (≤7d)` · `In grace (read-only)` · `Expired` · `Suspended` ·
  `Unlimited` (NULL end). ("Expiring" = before the end date; "In grace" = after the end date, within
  the 7-day read-only window.)
- **Platform switch** — a clear on/off toggle (`platform_enabled`) with an optional reason note;
  confirms on disable ("This blocks ALL users in <tenant>, including the owner"). Records
  `suspended_at`/`suspended_reason`.
- Seat count (live `public.users` count) shown next to the dates as the future billing basis.

New API routes (platform-admin guarded, service role):
- `PATCH /api/admin/tenants/[id]/subscription` — set start/term/end.
- `PATCH /api/admin/tenants/[id]/status` — flip `platform_enabled`.

---

## 7. Tenant owner UI (req #6) — Settings → Team

- **Subscription status card** (read-only for the owner): shows start, end, term, days remaining,
  status badge. The owner **cannot change dates** (platform admin owns that) — they see state +
  a "Contact UltraQuote to renew/change" line. Members don't see this card.
- **Team list gets a per-member Enable/Disable toggle** (the tenant kill switch):
  - Owner-only control; **the owner's own row has no toggle** (D3).
  - Disabling sets `users.enabled=false`, `disabled_at`, `disabled_by`. The user is blocked on next
    request and shows a red **Disabled** badge in the list; re-enable is one click.
  - Distinct from **revoke** (which deletes an unaccepted invite). Disable is for *accepted, active*
    users you want to pause without deleting — their quotes/ownership stay intact.

New API route (owner-guarded):
- `PATCH /api/team/members/[id]/status` — flip `users.enabled` (refuses if target is the owner or
  not in caller's tenant).

---

## 8. Interaction / edge cases

| Scenario | Behavior |
|---|---|
| New tenant invited | Subscription set on the invite form; `subscription_start` = invite-send date; end = start + term (D3b). |
| New user added mid-cycle | Inherits tenant `subscription_end` (co-terminous, D1). |
| Subscription renewed/extended | Platform admin updates `subscription_end`; all active seats carry forward automatically. |
| Subscription just passed end date (within 7d) | `grace` state: everyone read-only, red banner; writes 403 at API. Renewing clears it. |
| Tenant expired (past grace), owner logs in | Hard block → `/account/suspended` "contact UltraQuote to renew" (owner can't self-renew in v1). |
| Platform switch OFF while users are active | Everyone (incl. owner) blocked on next request; data untouched; flip back to restore. |
| Owner disables a member who owns quotes | Member loses access; their quotes remain (creator-owned). Other members still see them per existing read-tenant-wide RLS. |
| Disabled member re-enabled | Immediate restore on next request. |
| Platform admin's own tenant suspended | `/admin` still reachable (exempt); their normal dashboard view is blocked like anyone else. |
| `subscription_end = NULL` | Treated as Unlimited/active (grandfathered tenants). |
| Disabled/expired user mid-session | Caught on next server render; phase-2 RLS closes direct-API access. |

---

## 9. Build order — ✅ SHIPPED (merged to main e5ccfff; deployed + tested on prod 2026-06-14)

Steps 1–6 built; migrations 012–013 run on dev + prod. Files: `lib/access/access-state.ts` (resolver),
`lib/access/guard.ts` (`requireWriteAccess`), `lib/access/subscription.ts` (date math + status),
`/account/suspended` + `/account/disabled` pages, gate in `app/(dashboard)/layout.tsx`,
`components/account/subscription-banner.tsx`, admin Subscription panel + Manage modal + invite-time
dates (`components/admin/admin-client.tsx`, `/api/admin/tenants/[id]/{subscription,status}`,
extended invite route), owner Team toggle + `components/settings/subscription-card.tsx`
(`/api/team/members/[id]/status`), write-guard wired into quote create/duplicate/send/apply-pricing
+ AI write + product import, Help content (Team topic). Phase 2 (email cron, RLS hardening) not yet
built. Original plan below for reference.


1. **Migration 012** — columns + backfill + read/write access helpers (`tenant_can_read/write`,
   `user_can_read/write`).
2. **`getAccessState` + `/account/suspended` + `/account/disabled` pages**; wire the gate into the
   dashboard layout (after MFA). *(Core enforcement.)*
3. **Platform admin: subscription on the invite form** (start = invite date, term picker; extend
   `/api/admin/tenants/invite`) **+ Subscription panel + switch** on existing tenants (`/admin` +
   2 API routes) — set dates, suspend.
4. **Owner Team enable/disable toggle + subscription status card** (+ 1 API route).
5. **In-app expiry banner.**
6. **Help content** (§10) into `lib/help/content.ts` (Team topic) + this doc promoted.
7. *(Phase 2)* Email reminders cron; RLS hardening with the helper functions; (later) self-serve
   renew / Stripe — hooks already present (`tenants.stripe_customer_id`).

---

## 10. Help content draft (tenant owner) — promote into `lib/help/content.ts` (Team topic) on build

> **Your subscription & team access**
>
> **Subscription.** Your UltraQuote subscription has a start and end date, shown on the **Team** page
> under Settings. Everyone on your team shares the same subscription period — when you add a new user,
> their access runs to the same end date as everyone else's. You'll see a reminder banner when your
> subscription is within 7 days of ending. To renew or change your dates, contact UltraQuote (the
> dates are managed by us).
>
> **After the end date (read-only grace).** If your subscription lapses, your team isn't locked out
> immediately — for a short grace period everyone can still **view** quotes and data but can't create,
> edit, or send. A red banner shows how long you have. Renewing restores full access; if the grace
> period passes without renewal, access is paused until you renew.
>
> **Pausing a user (Enable / Disable).** On the **Team** page you can **Disable** any team member to
> immediately block their access — useful when someone leaves or is away — without deleting them or
> their quotes. Toggle them back to **Enable** to restore access instantly. You can't disable
> yourself (the owner). Disabling is different from *revoking an invite*: revoke is for people who
> haven't accepted yet; disable is for active users.
>
> **If your team can't sign in.** Access can be paused for three reasons: your subscription has ended,
> the user was disabled on the Team page, or UltraQuote has suspended the account — the sign-in screen
> will say which. Contact UltraQuote if your whole team is locked out.

(Add an "Owner only" badge to the subscription/disable sections, consistent with other Team help.)

---

## 11. Locked decisions (confirmed 2026-06-13)

1. **Expiry → read-only grace**, then hard block. `GRACE_DAYS = 7` (single constant). During grace,
   users can view but not create/edit/send; after grace, hard block. (See D2.)
2. **Dates are platform-admin-only for v1.** Owner sees subscription state read-only + "contact
   UltraQuote"; no owner self-renewal yet (Stripe/self-serve is a later layer;
   `tenants.stripe_customer_id` hook already exists).
2b. **New-tenant dates set at invite time; clock starts on the invite-send date** (D3b) — not on
    acceptance/first login, deliberately, to pressure the owner to activate promptly. Blank = Unlimited.
3. **Reminders = in-app banner only** for this build (amber at ≤7 days before end). Email reminder
   cron is deferred to phase 2.
4. **Enforcement = request-layer now** (dashboard layout gate + API write guard), **RLS hardening as
   a fast-follow** using the read/write helpers (`tenant_can_read/write`, `user_can_read/write` —
   defined in the migration now; grace allows reads, blocks writes).

Still worth deciding during build (not blockers): exact grace-state UI depth (banner + hidden create
buttons vs. exhaustive field disabling — proposed: banner + hidden primary actions, rely on API
write-block); whether `/account/suspended` should auto-sign-out or just offer the button.
