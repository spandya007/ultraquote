# Mobile responsiveness

Assessment (2026-06-15): UltraQuote was desktop-first. Tier 1 ("usable on a phone") is now done;
Tier 2/3 are backlog — prioritize later.

## ✅ Tier 1 — DONE (branch `feature/mobile-tier1`)
- **Off-canvas sidebar.** On `<md` the sidebar becomes a slide-in drawer with a fixed hamburger top
  bar (brand + menu button) and a tap-to-close backdrop; it closes on navigation. On `md+` it's the
  same static rail as before (collapse toggle is desktop-only; mobile drawer always shows the full
  layout). `components/ui/sidebar.tsx`; the dashboard `<main>` got `pt-14 md:pt-0` to clear the bar.
  - Note: the sign-out confirm modal was moved outside `<aside>` because the aside now has a
    transform (off-canvas), which would otherwise trap `position: fixed` children.
- **Horizontally scrollable list tables.** Quotes + Products tables wrap in `overflow-x-auto` with a
  `min-w-[...]` so columns stay readable and scroll instead of crushing on narrow screens.
- **Responsive page padding.** Dashboard pages use `p-4 md:p-6` / `p-4 md:p-8` (was fixed `p-6`/`p-8`).

## ⏳ Tier 2 — backlog (polish)
- Quote editor (`/quotes/[id]`): control-dense header + two-pane layout need a small-screen pass
  (stack panels, wrap header actions, larger touch targets). Hardest screen.
- Modal/drawer sizing audit on very small screens; touch-target sizes (min 40px) on icon buttons.
- Settings/Team/Admin tables and forms: verify wrapping on phones.

## ⏳ Tier 3 — backlog (product decision)
- True phone-optimized quote *authoring* (BlockNote document editing on mobile is inherently rough).
  Reasonable stance: make viewing/managing mobile-friendly (Tier 1/2), keep heavy authoring a
  desktop task. Decide before investing here.

## Verifying
Tier 1 is a layout/CSS change (type-checks clean). Eyeball it in the browser's responsive/device mode
(or a real phone) at ~375px: hamburger opens/closes the drawer, drawer closes on nav, tables scroll
sideways, pages aren't cramped. The sidebar only renders behind auth, so it must be checked while
signed in.
