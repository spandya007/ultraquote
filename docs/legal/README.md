# Legal documents

**Status: DRAFTS — pending legal review. Not in effect.**

- [`terms-of-service.md`](terms-of-service.md) — Terms of Service (clickwrap target)
- [`privacy-policy.md`](privacy-policy.md) — Privacy Policy (companion; referenced by the ToS)

These are engineering first-drafts tailored to UltraQuote's actual stack (Supabase, Gemini, DocuSeal,
Railway, email) and subscription model. They are **not legal advice** — have a qualified attorney
review and adapt them, and fill every `[BRACKETED]` placeholder, before publishing.

## Next step (not yet built): accept-to-use gate
Once the documents are finalized, the planned implementation (design discussed, not yet coded):
1. `lib/legal/tos.ts` with `CURRENT_TOS_VERSION`; publish the text as `/terms` + `/privacy` pages.
2. Migration: `users.tos_accepted_version` + `tos_accepted_at`, plus an append-only `tos_acceptances`
   audit table (user_id, version, accepted_at, ip, user_agent).
3. `/accept-terms` page (outside the dashboard shell, like `/account/suspended`) — shows the ToS +
   Privacy link + "I agree" checkbox → `POST /api/legal/accept-tos`.
4. Gate in `app/(dashboard)/layout.tsx` after the MFA + subscription gates: if
   `tos_accepted_version !== CURRENT_TOS_VERSION` → redirect to `/accept-terms`. Bumping the version
   re-prompts everyone (handles "Changes to the Terms").
5. Optional: add an "I agree" checkbox to `/auth/set-password` so invitees accept at signup.

Decisions to confirm before building: every-user vs owner-only acceptance (recommend every user);
audit table vs columns only (recommend audit table for proof).

---

## ⏸️ Pick-up checklist (read this first when revisiting)

Status as of **2026-06-14**: drafts written, **not reviewed**, **nothing wired into the app**. Branch
`feature/legal-docs` (not merged). Known sub-processors already filled in (Supabase, Gemini, DocuSeal,
Railway, **Netlify** hosting, **Zoho Mail** email).

### A. Missing information needed to FINALIZE the documents (from the business/owner + a lawyer)
- [ ] **Legal entity name** (who operates UltraQuote) — `[LEGAL ENTITY NAME]`
- [ ] **Business address** — `[ADDRESS]`
- [ ] **Legal/contact email** for notices & privacy requests — `[CONTACT EMAIL]`
- [ ] **Governing law** (state/country) + **venue**, and whether to include **arbitration / class-action waiver** (ToS §16)
- [ ] **Effective date** (set when published) — `[EFFECTIVE DATE]`
- [ ] **Fees & payment terms**: amount basis (per seat?), billing frequency, currency, taxes, due dates, late-payment (ToS §4.4)
- [ ] **Refund policy** (ToS §4.5)
- [ ] **Fee-change notice period** (ToS §4.6)
- [ ] **Data retention period** after termination, incl. backups (ToS §9.3, Privacy §6)
- [ ] **Liability cap** period/amount + any carve-outs (ToS §13) — currently drafted as 12 months
- [ ] **SLA / uptime** commitment? If none, leave as "as is" (ToS §12)
- [ ] **GDPR**: does it apply (EU/UK customers)? legal bases (Privacy §2), EU/UK representative/DPO, SCCs for transfers (§5), and whether a separate **DPA** is needed
- [ ] **CCPA/CPRA**: applicability + required disclosures; confirm "we don't sell data" is accurate (Privacy §3, §8)
- [ ] **Gemini AI data-use terms**: confirm whether inputs are used for training/retained, and state it (Privacy §4) — depends on the Google API tier in use
- [ ] Whether to publish a standalone **sub-processor page** and keep it current (Privacy §3)
- [ ] Confirm **controller/processor** split is stated correctly for Customer Content (Privacy roles note)
- [ ] **Legal review** of the whole thing (esp. §§12–14, 16) — these are an engineering scaffold, not legal advice

### B. Open product/design questions for the ACCEPTANCE GATE (decide before building)
- [ ] **Who must accept?** Every user, or Owner only? → recommendation: **every user** (each clicks "I agree" for their own use).
- [ ] **Storage**: audit table (`tos_acceptances`) + columns, or columns only? → recommendation: **audit table** (records every acceptance: version, timestamp, IP, user-agent) for legal proof.
- [ ] **Capture IP + user-agent** at acceptance? → recommendation: **yes** (strengthens clickwrap evidence).
- [ ] **Privacy Policy alongside ToS** in the same accept screen? → recommendation: **yes** (present both, one "I agree").
- [ ] **Also add an "I agree" checkbox at `/auth/set-password`** (signup), with the layout gate as the backstop? → recommendation: **yes**.
- [ ] **Separate Master Services Agreement** for the paying Owner (heavier contract) beyond per-user clickwrap? → **business decision**, out of scope unless wanted.
- [ ] Version format for `CURRENT_TOS_VERSION` (e.g. date `"2026-06-14"` vs `"v1.0"`) — pick one; bumping it re-prompts everyone.

### C. Build steps once A + B are settled (see the section above for detail)
1. `lib/legal/tos.ts` (`CURRENT_TOS_VERSION`) + public `/terms` and `/privacy` pages rendering the finalized text.
2. Migration: `users.tos_accepted_version` + `tos_accepted_at` + append-only `tos_acceptances` table.
3. `/accept-terms` page (outside dashboard shell) + `POST /api/legal/accept-tos`.
4. Gate in `app/(dashboard)/layout.tsx` after MFA + subscription gates.
5. Optional signup checkbox at `/auth/set-password`.
6. Footer/login links to `/terms` + `/privacy`.
