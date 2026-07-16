# QuickBooks Online (A3) — Sandbox Test Checklist

> Exercises the QBO connector end-to-end: connect (OAuth) → sign a quote → invoice appears in QBO.
> Run against the **Intuit sandbox** first. Related: `docs/integrations-phase-a-plan.md` (A3).

## 0 — One-time setup (do these before any test)

**Intuit developer app**
- [ ] Create an app at developer.intuit.com → **QuickBooks Online and Payments**.
- [ ] Grab the **Development** (sandbox) `Client ID` + `Client Secret`.
- [ ] Under **Redirect URIs**, add the exact callback URL(s):
  - Dev: `http://localhost:3000/api/integrations/qbo/callback`
  - Prod: `https://app.ultraquote.io/api/integrations/qbo/callback`
- [ ] Scope needed: `com.intuit.quickbooks.accounting` (set in code; just confirm the app allows it).
- [ ] Confirm you have a **sandbox company** (Intuit auto-creates one; see the developer dashboard → Sandbox).

**Env vars** (dev = `.env.local`; prod = Netlify, **All Scopes**, then redeploy)
- [ ] `INTEGRATIONS_ENC_KEY` = output of `openssl rand -base64 32`  ← same value must stay stable (rotating it makes stored tokens undecryptable)
- [ ] `QBO_CLIENT_ID`
- [ ] `QBO_CLIENT_SECRET`
- [ ] `QBO_REDIRECT_URI` = the EXACT callback URL registered above (env-specific)
- [ ] `QBO_ENV` = `sandbox`

**Database**
- [ ] Migrations `028` + `029` applied to the environment you're testing (dev already done; run on prod before prod test).
- [ ] Test tenant is on an **entitled plan** (beta or any subscription tier) — check `/admin`.

---

## 1 — Connect (OAuth happy path)
- [ ] Log in as the **owner** of the test tenant → `/settings` → **Integrations** card.
- [ ] QuickBooks Online shows a **Connect** button (not "Coming soon", not the locked state).
- [ ] Click **Connect** → redirected to Intuit → sign in with the **sandbox** company → Authorize.
- [ ] Land back on `/settings` with a green toast **"QuickBooks Online connected."**
- [ ] The card now shows QuickBooks as **Connected** with a **Disconnect** button.
- [ ] DB check (service role): `select provider, status, account_ref, expires_at from tenant_integrations where provider='qbo';`
  - `status='connected'`, `account_ref` = the sandbox **realmId**, `access_token`/`refresh_token` look like `v1:...` (encrypted).

## 2 — Gating (negative checks)
- [ ] Set the tenant to **pay-per-use** in `/admin` → reload `/settings`: Integrations shows the **locked** upsell state (no Connect).
- [ ] Hit `/api/integrations/qbo/connect` directly as a **member** (non-owner) → redirected to `/settings?integration=forbidden` (toast "Only the account owner…").
- [ ] Put the tenant back on an entitled plan for the rest of the tests.

## 3 — Invoice on signed (the headline)
- [ ] Create/open a quote for a client with a real **email**, with a **recommended** scenario that has a couple of line items (include one **discounted** line and one with a **setup fee** to test the mapping).
- [ ] Send it for signature (DocuSeal sandbox) and complete **all** signers so the quote flips to **signed**.
- [ ] In the **QBO sandbox** (app.sandbox.qbo.intuit.com): a new **Invoice** exists for that customer.
  - [ ] Customer was created/matched by company name.
  - [ ] Line **amounts match the quote's discounted totals**; the setup fee appears as its own "… — setup (one-time)" line.
  - [ ] Invoice `DocNumber` = the quote number.
- [ ] DB check: `select qbo_invoice_id from quotes where id='<quote>';` is now set.

## 4 — Idempotency & edge cases
- [ ] Re-deliver the same DocuSeal "completed" webhook (or re-run the completion) → **no duplicate** invoice (skips because `qbo_invoice_id` is set).
- [ ] Disconnect QBO, then sign another quote → **no** invoice created, and the webhook still returns 200 / the quote still marks signed (best-effort, never blocks signing).
- [ ] Quote with an empty/zero scenario → no invoice, no error in logs.

## 5 — Token refresh
- [ ] Force an expired access token: `update tenant_integrations set expires_at = now() - interval '1 hour' where provider='qbo';`
- [ ] Trigger any QBO call (sign a quote, or reconnect) → it should **refresh silently** and succeed.
- [ ] DB check: `expires_at` moved ~1h into the future AND `refresh_token` changed (newest token persisted). ← this is the critical QBO correctness check.

## 6 — Disconnect
- [ ] `/settings` → **Disconnect** → confirm → toast "Disconnected"; the row is gone from `tenant_integrations`; card shows **Connect** again.

---

## Notes / known v1 limitations (expected, not bugs)
- **Tax is deferred to QBO (not mirrored).** We don't push `quotes.tax_rate`; each line is flagged
  taxable/non-taxable from the quote's `is_taxable` (QBO `TaxCodeRef` TAX/NON) and **QBO computes the
  rate** from the customer address (Automated Sales Tax). So the signed proposal total (our estimated
  tax) and the QBO invoice total may differ by the tax amount — expected, by design. To verify: mark a
  line taxable on the quote and confirm QBO applies tax to that line (and not to non-taxable lines).
- **One fallback item.** All lines reference a single "UltraQuote Services" service item (created on first use); we don't yet map to catalog Items. Per-line description carries the detail.
- **Only the recommended scenario** is invoiced (falls back to selected → first).
- No estimate-on-send and no payment posting yet.

## If something fails
- Netlify **function logs** (or local terminal) — the connector logs `[qbo] …` on invoice create/fail.
- `?integration=qbo_error` toast on return = token exchange failed → check `QBO_REDIRECT_URI` matches Intuit EXACTLY and the client id/secret are the sandbox pair.
- `qbo_state_error` = took >10 min on the consent screen, or `INTEGRATIONS_ENC_KEY` changed between connect and callback.
- 500 on invoice with "No Income account" = the sandbox company has no Income account (unlikely; default sandbox has them).
