# Subscription & Access Lifecycle — Manual Test Plan

> For the `feature/subscription-access` branch. Migration 012 is already run on **dev**.
> Run against the dev Supabase project (local `.env.local`). Tick each box; note anything off.
> Design reference: `docs/subscription-and-access-lifecycle-design.md`.

## Legend
- **PA** = platform admin (you, `sameer@cmithayward.com` — has `/admin`).
- **Owner** = a tenant owner (e.g. CMIT Hayward owner, or Pandya's owner).
- **Member** = a non-owner user in a tenant (e.g. `sales@cmithayward.com`).
- "Block page" = `/account/suspended`; "Disabled page" = `/account/disabled`.
- Date math: end date is inclusive; **grace = end+1 … end+7**; **hard block from end+8**.

---

## 0. Pre-flight
- [ ] On `feature/subscription-access`, app builds and runs (`npm run dev`).
- [ ] Confirm migration 012 ran on dev: in Supabase, `tenants` has `subscription_end`, `platform_enabled`; `users` has `enabled`.
- [ ] Existing tenants show **Unlimited** in `/admin` (NULL end) — nobody is locked out by default. ✅ = grandfathering works.

---

## 1. Platform admin — invite-time subscription (D3b)
- [ ] `/admin` → Invite form shows **Subscription term** (default *Yearly*) + a computed **Ends** date = today + 1 year.
- [ ] Switch term to **Monthly** → Ends = today + 1 month; **Quarterly** → +3 months; **Custom** → a date picker (min today).
- [ ] Switch term to **Unlimited (no end date)** → Ends shows "No end date".
- [ ] Invite a throwaway tenant with term = **Monthly**. After send, its row shows **Active** + "ends <today+1mo>".
- [ ] Invite another with **Unlimited** → row shows **Unlimited**, no end date.
- [ ] (Optional) Confirm in DB the new tenant's `subscription_start` = **today** (invite-send date), not blank.

## 2. Platform admin — manage existing subscription
- [ ] `/admin` → a tenant → **Manage**. Modal shows current Start / Term / End.
- [ ] Set term **Yearly**, Save → row badge **Active**, end = start + 1 year.
- [ ] Set term **Custom** with an end date **in the past (yesterday)**, Save → badge **In grace (read-only)**.
- [ ] Set Custom end **8+ days ago**, Save → badge **Expired**.
- [ ] Set term **Unlimited**, Save → badge **Unlimited**, end cleared.
- [ ] Validation: Custom term with no end date → error toast; end before start → error.

## 3. Expiry reminder banner (≤7 days)
- [ ] Set a tenant's end date to **today + 3 days** (Custom). Log in as a **user of that tenant**.
- [ ] Amber banner: "subscription ends in 3 days (<date>)." Owner sees "Contact UltraQuote to renew"; member does **not**.
- [ ] **Dismiss** → banner gone; reload → stays gone (dismissed for that end date).
- [ ] PA changes end date to a new value → banner **re-appears** (dismissal is per end-date).
- [ ] Set end to **today + 10 days** → no banner (outside 7-day window).

## 4. Read-only grace (end+1 … end+7)
Set the tenant's end date to **yesterday** (Custom). Log in as an **owner** of that tenant.
- [ ] App loads (not blocked) with a **red read-only banner**: "Subscription expired… read-only… access ends <end+7>."
- [ ] **Write is blocked:** Quotes → New Quote → expect a 403 / error toast (route guarded). Same for: Duplicate a quote, Send for signature, Import products CSV, Extract/Apply pricing, Ask AI.
- [ ] **Read still works:** open an existing quote, Preview, view Products/Clients/Dashboard — all load.
- [ ] As a **member** of the same tenant: same read-only banner (no renew CTA), same write blocks.
- [ ] PA renews (set end to future) → banner clears, writes work again.

> Note: scenario/line-item inline edits and quote auto-save go directly through Supabase (not the
> guarded API routes), so during grace they may still persist until the **phase-2 RLS hardening**.
> Expected for v1 — the API-routed writes above are the ones enforced now. Confirm the banner shows
> and the New Quote / Send / Import paths are blocked; don't fail the test on inline line-item edits.

## 5. Hard block — expired (past grace)
Set the tenant's end date to **8+ days ago**.
- [ ] Owner logs in → redirected to **block page**, title **"Subscription expired"**, body mentions contacting UltraQuote to renew. **Sign out** button works.
- [ ] Member logs in → block page, **"Subscription expired"**, member-worded body.
- [ ] No part of the dashboard is reachable (try navigating to `/quotes` directly → still redirected).
- [ ] PA renews → both can log in normally again.

## 6. Platform kill switch (suspend whole tenant)
- [ ] `/admin` → Manage a tenant with a **valid/active** subscription → **Suspend tenant** (confirm dialog warns it blocks all users incl. owner). Optional reason.
- [ ] Row badge → **Suspended**.
- [ ] Owner of that tenant → block page, title **"Account suspended"** (not "expired").
- [ ] Member → same block page.
- [ ] PA → **Re-enable tenant** → both can log in again. (Suspension overrides subscription dates: a suspended tenant blocks even if dates are valid.)
- [ ] Precedence check: suspend a tenant that is **also** expired → block page says **"Account suspended"** (suspended wins).

## 7. Tenant kill switch (owner disables a member)
- [ ] Log in as **Owner** → Settings → Team. Each **member** row has a **Disable** button. The **owner's own row has none**.
- [ ] Disable a member (confirm dialog: "kept their quotes"). Row shows **disabled** badge + an **Enable** button.
- [ ] Log in as that **member** → **Disabled page** ("Access disabled… contact your administrator"). Sign-out works.
- [ ] Member's **quotes still exist** (owner can see them in /quotes).
- [ ] Owner re-enables → member can log in again.
- [ ] Guard: try disabling via the API on an **owner** id → rejected ("owner can't be disabled"). (Optional, dev-tools.)

## 8. Platform admin exemption
- [ ] While **your own tenant** is suspended or expired (set it so), confirm **`/admin` still loads** for you (PA exempt), even though your normal dashboard view is blocked.
- [ ] (Reset your own tenant to Active afterward.)

## 9. Owner subscription card (read-only)
- [ ] Owner → Settings → **Subscription** card shows Start / Ends / Term + a status badge.
- [ ] In **grace**, card shows the red "read-only until renewed" line.
- [ ] **Member** does **not** see the Subscription card.
- [ ] No editing controls on the card (dates are PA-managed).

## 10. Help content
- [ ] `/help` → "Your team & permissions" topic has: **Your subscription**, **After the end date (read-only grace)**, **Pausing a user**, **If your team can't sign in** — first three badged **Owner only**.

---

## Reset after testing
- [ ] Set every tenant you touched back to a sensible state (Active/Unlimited, `platform_enabled = true`, members enabled).
- [ ] Delete any throwaway tenants you invited in §1.

## Known v1 limitations (do NOT log as bugs)
- Inline scenario/line-item edits + quote metadata auto-save can still persist during grace (direct-to-DB, not API-guarded) — closes with phase-2 RLS hardening.
- A user disabled/expired **mid-session** is caught on their **next** server navigation, not instantly.
- Email expiry reminders are phase 2 — only the in-app banner exists now.
