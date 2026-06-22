# UltraQuote Brand Palette — "Signal" (Blue + Teal)

Locked 2026-06-21. Blue stays the primary brand/action color; **teal** is the accent
for section eyebrows, highlights, icon tiles, and decorative detail. Navy is the dark
surface (covers, footers).

| Role | Name | Hex | Use |
|---|---|---|---|
| Primary | Brand Blue | `#2563EB` | Primary buttons, headline highlight, links, featured plan |
| Primary (dark) | Brand Blue Dark | `#1D4ED8` | Hover / pressed states |
| Accent | Teal | `#0EA5A4` | Eyebrows, accent bars, icon tints, secondary buttons, step numbers |
| Accent (text) | Teal Dark | `#0F5F5C` | Teal text on light teal fills |
| Accent (fill) | Teal Mist | `#ECFEFF` | Icon tile backgrounds, light accent sections |
| Accent (badge) | Teal 100 | `#CCFBF1` | "Beta" badge fill (with Teal Dark text) |
| Ink | Navy | `#0B1F3A` | Dark backgrounds, primary headings |
| Neutral | Slate | `#64748B` | Body / muted text |
| Neutral | Line | `#E2E8F0` | Borders / dividers |
| Neutral | Cloud | `#F8FAFC` | Light surface fills |
| Semantic | Success | `#16A34A` | "You save / signed / won" states |
| Surface | White | `#FFFFFF` | Base background |

Brand gradient (covers/CTA): `linear-gradient(135deg, #2563EB → #0EA5A4)`.
Note: the in-app default accent (`lib/theme/accents.ts`) is blue `#2563eb`, which stays
compatible — teal is a marketing accent layered on top, not an app theme change.
