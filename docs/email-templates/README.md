# UltraQuote — Auth email templates

Versioned copies of the Supabase Auth email templates so we have a source of truth to paste from.
Supabase stores these per-project, so they must be set **separately on dev and prod**.

## Where to paste

Supabase Dashboard → **Authentication → Emails → Templates** → pick the template → edit Subject +
message (HTML) → **Save**. (Delivery still goes through the configured Zoho SMTP; these files are the
*content* only.)

| File | Supabase template | Suggested subject | When it fires |
|---|---|---|---|
| [`invite-user.html`](invite-user.html) | **Invite user** | `You're invited to {{ .Data.tenant_name }} on UltraQuote` | Platform-admin tenant-owner invites + Settings → Team member invites |
| [`reset-password.html`](reset-password.html) | **Reset Password** | `Reset your UltraQuote password` | "Forgot password?" on `/login` |
| [`confirm-signup.html`](confirm-signup.html) | **Confirm signup** | `Confirm your UltraQuote email` | Direct sign-up confirmation (rare — UltraQuote is invite-only today) |

## Rules / gotchas

- **Link uses the click-to-confirm flow (token_hash), NOT `{{ .ConfirmationURL }}`.** The button links
  to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<invite|recovery|signup>`. This is
  deliberate: email security scanners prefetch links and would consume a normal single-use
  `{{ .ConfirmationURL }}` before the user clicks. Our `/auth/confirm` page only calls `verifyOtp` on an
  explicit button click, so scanners' prefetch GETs don't burn the token. See
  `docs/invite-link-scanner-design.md`. (`{{ .SiteURL }}` = the Supabase Auth **Site URL**, e.g.
  `https://app.ultraquote.io`.) Requires the `/auth/confirm` page to be deployed.
- **Invite metadata** is attached by our code (`lib/invites.ts`): `{{ .Data.tenant_name }}`,
  `{{ .Data.full_name }}`, `{{ .Data.role }}`. `full_name` may be empty if the inviter didn't supply
  a name — the greeting then renders "Hi ,". Fill in a name on invite, or simplify the greeting.
- The **same Invite template** serves both owner and member invites — the `role`/`tenant_name`
  variables make one template work for both.
- Set on **dev now**; re-apply on **prod** before real onboarding. The Supabase email rate limit
  (Auth → Rate Limits) was already bumped above the default.
- Inline styles only — many email clients strip `<style>`/external CSS.
