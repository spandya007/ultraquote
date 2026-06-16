# Invite/reset links eaten by email security scanners — design (fix soon)

> **Priority: HIGH — launch-affecting.** Discovered 2026-06-16. The initial target audience is **CMIT
> MSPs**, whose business inboxes almost all run email-security gateways (Microsoft Defender Safe Links,
> Mimecast, Proofpoint URL Defense). These **pre-click/prefetch every link to scan it**, which
> **consumes the single-use invite/reset token before the human ever clicks** → the user sees
> "This link is invalid or has expired." Reproduced sending to `spandya@cmitsolutions.com`.

## Root cause
Supabase invite/recovery emails link to the GoTrue verify endpoint
(`/auth/v1/verify?token=…&type=invite&redirect_to=…`). That endpoint is a **GET** that **consumes the
one-time token on access** and redirects to our `/auth/set-password` with the session in the URL hash
(implicit flow). A scanner's automated GET of the link consumes the token; the human's later click
then fails. Time-expiry is a *separate*, lesser cause.

> Note: this is NOT a misconfiguration of our domain/SMTP/redirect setup — those are all verified
> working (the failing click still correctly landed on `app.ultraquote.io/auth/set-password`). It's
> inherent to single-use GET links + link-prefetching scanners.

## Recommended fix — "click-to-confirm" landing page (token_hash + verifyOtp)
Move token consumption from a **GET that the scanner triggers** to an **explicit user click** on our
own page, so a scanner that merely loads (GETs) the page doesn't burn the token.

1. **New public page `/auth/confirm`** (allowed by middleware like other `/auth/*`).
   - Reads `token_hash`, `type` (`invite` | `recovery` | `signup` | `email`), and `redirect_to` from
     the query string. Renders a branded **"Continue" button** — and does **nothing automatically**.
   - On the user's click: `supabase.auth.verifyOtp({ type, token_hash })`. This is the step that
     consumes the token and establishes the session — only on a real click, not on page load.
   - On success → route to `/auth/set-password` (now session-backed) to set the password; on error →
     show the existing "link invalid/expired — request a new one" UI.
2. **Update the Supabase email templates** (Invite user, Reset Password, Confirm signup) so the link
   points at our confirm page instead of the raw verify endpoint, e.g.:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&redirect_to={{ .RedirectTo }}
   ```
   (Use the matching `type` per template: `recovery` for reset, `signup`/`email` for confirmation.)
   Apply on **both dev and prod** projects. Update the versioned copies in `docs/email-templates/`.
3. **Adjust `/auth/set-password`** (`components/auth/set-password-form.tsx`): today it establishes the
   session from the URL **hash** (implicit flow). With the confirm-page approach the session already
   exists after `verifyOtp`, so set-password just calls `auth.updateUser({ password })`. Keep the old
   hash path as a fallback for any in-flight links, or cut over fully.

### Why this helps
Most scanners **GET** links but don't **click buttons / run the click handler**, so they load
`/auth/confirm` harmlessly without calling `verifyOtp` → the token survives for the human. It's the
standard Supabase-recommended mitigation (token_hash + `verifyOtp` on a custom confirmation route).

### Caveats / residual risk
- A minority of aggressive scanners execute JS or auto-click; those can still consume it. Not 100%,
  but eliminates the vast majority of failures.
- Still single-use + time-limited — also **raise the email OTP/link expiry** (Auth settings) so slow
  clicks don't expire.
- Verify the flow end-to-end for **invite, reset, and signup** (all three link types).

## Interim mitigations (until built)
- Resend + click fast (fresh token; sometimes the human wins the race).
- Tell affected users to request a new link if the first fails.
- For demos, send to a non-scanned inbox (personal Gmail) to confirm the happy path.

## Touch points
- New: `app/auth/confirm/page.tsx` (+ a small client form).
- Edit: `components/auth/set-password-form.tsx` (session-backed path).
- Edit: Supabase email templates (dev + prod) + `docs/email-templates/*`.
- The invite/reset *redirect target* (`lib/invites.ts` `inviteRedirectUrl`, forgot-password form) can
  stay `/auth/set-password`; pass it through as `redirect_to`.
