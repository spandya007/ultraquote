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
