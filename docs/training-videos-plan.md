# UltraQuote — Training Video Plan

> Working doc. Goal: define the set of training/onboarding videos to produce for UltraQuote,
> who each is for, and roughly how long. Nothing here is final — we're using this to discuss and prioritize.

## Audiences
1. **New tenant Owner** — the MSP owner who just got invited, needs to set up the company and send a first quote.
2. **Team Member** — a salesperson at an MSP tenant; creates/sends quotes but can't touch products/settings.
3. **Platform Admin** — us / whoever runs UltraQuote; onboards tenants, manages subscriptions.
4. **Prospect / marketing** — short sizzle content for the website and sales calls (not "training" per se, but worth flagging).

## Format options (pick one as the default)
- **A. Short task videos (2–4 min each)** — one job per video ("How to send a quote for signature"). Easy to keep current, great for an in-app Help deep-link. **← recommended default.**
- **B. Long walkthroughs (10–20 min)** — full workflow start-to-finish. Fewer files, but expensive to re-record when a feature changes.
- **C. Hybrid** — one ~8-min "Quick Start" overview + a library of short task videos. Best coverage, most work.

---

## Proposed video library (Owner + Member)

### Tier 1 — Must-have for launch (getting a quote out the door)
| # | Title | Audience | ~Len | Covers |
|---|-------|----------|------|--------|
| 1 | Quick Start: from login to your first sent quote | Owner | 6–8 min | The 5-min happy path; sets context for everything else |
| 2 | Setting up your company | Owner | 3 min | Logo, company details, **tax rate**, quote defaults (prefix, valid days, payment terms) |
| 3 | Building your product catalog | Owner | 4 min | Add products, pricing tiers, setup fees; **CSV import** + template |
| 4 | Adding clients | Owner/Member | 2 min | Add/edit, logo, **secondary contact/2nd signer, structured address**, CSV import |
| 5 | Creating a quote | Owner/Member | 4 min | New Quote, scenarios, add from catalog, free-text lines, qty/discounts |
| 6 | Scenarios & the "Recommended" option | Owner/Member | 3 min | Good/better/best, star a scenario, per-scenario totals |
| 7 | Discounts, setup fees & tax | Owner/Member | 3 min | Per-line %/$ discount, "You save", one-time setup, company tax rate |
| 8 | Writing the proposal (Document tab) | Owner/Member | 4 min | BlockNote basics, insert fields ({{client.*}}), logos, page breaks |
| 9 | Adding pricing tables to the document | Owner/Member | 2 min | Inline pricing block, recommended/all/specific |
| 10 | Preview & PDF | Owner/Member | 2 min | Preview modal, header/footer toggle, download PDF |
| 11 | Sending for signature (DocuSeal) | Owner/Member | 4 min | Signers, signature/initials/checkbox fields, send flow, status lifecycle |

### Tier 2 — Depth & power features
| # | Title | Audience | ~Len | Covers |
|---|-------|----------|------|--------|
| 12 | Templates | Owner/Member | 3 min | Save-as-template, start a quote from a template, export/import |
| 13 | AI writing assistant | Owner/Member | 3 min | Improve/expand/shorten/tone, generate, continue, preview-before-apply |
| 14 | Import a proposal from Word/Markdown | Owner/Member | 2 min | .docx/.md import into the Document |
| 15 | Extract pricing from a document | Owner | 3 min | Doc tables → scenarios, link/create/free-text review |
| 16 | Duplicating & reusing quotes | Owner/Member | 2 min | Duplicate action, refresh prices from catalog |
| 17 | Team, roles & permissions | Owner | 3 min | Invite members, owner vs member, quote ownership, read-only |
| 18 | Security: password & 2FA | All | 3 min | Change password, enroll TOTP, recovery codes |
| 19 | Dashboard & pipeline | Owner | 2 min | Open pipeline, MRR, win rate, expiring soon |
| 20 | Appearance | All | 1 min | Dark mode, accent themes |

### Tier 3 — Platform Admin (internal)
| # | Title | Audience | ~Len | Covers |
|---|-------|----------|------|--------|
| 21 | Onboarding a new tenant | Platform Admin | 4 min | /admin invite-first flow, set-password landing |
| 22 | Subscriptions & access lifecycle | Platform Admin | 4 min | Terms, expiry/grace, kill switches, company-field locking |
| 23 | AI cost monitoring | Platform Admin | 2 min | "AI cost per signed doc" card, the 25-call/quote cap |

---

## Open questions to decide
1. **Format:** A / B / C above?
2. **Scope for v1:** just Tier 1 (11 videos), or Tier 1 + a few Tier 2?
3. **Hosting:** in-app Help deep-links, a YouTube channel, Loom, or hosted on the marketing site?
4. **Branding/production:** screen-recording with voiceover, or narrated + captions? Intro/outro bumper?
5. **Who records:** you narrate, or scripted for a voice actor / AI voice?
6. **Sample data:** use the CMIT tenant, or a clean demo tenant so nothing real is shown?

## Notes / parking lot
- Keep each Tier-1 video mapped to an existing Help topic so we can deep-link from the "?" contextual help.
- Document editor is now on **BlockNote 0.51.4** (upgrade already shipped) — so videos 8/9/13 can be recorded against the current UI. Cover the new **two-column layout** in video 8.
