# Business / Brand Voice Profile — Design

Status: **approved** (scope + fields confirmed with user 2026-06-29)
De-hardcodes the "MSP" author role in AI proposal drafting (`/api/ai/draft`,
system prompt) so the tool fits any vertical (security-camera installer, HVAC,
MSP, …). Feeds every AI writing feature, not just Draft. Pairs with
`docs/ai-proposal-drafting-design.md` (the brand profile is the *who is writing*
context; the Phase-2 intake is the *this-proposal* context).

## Problem
The draft system prompt hardcodes *"expert proposal writer for a Managed Service
Provider (MSP)"* and a generic "professional" voice. Sell UltraQuote to a
security-camera installer and the messaging/voice is wrong. The author's identity
and voice must be configurable per business.

## Confirmed decisions
- **Scope:** tenant-level fields **+ org-level defaults with tenant override**
  (white-label/franchise Orgs set a house voice; each workspace can override).
- **Fields (3):**
  - `business_type` — one line; replaces "MSP" in the role sentence
    (e.g. "commercial security camera & access-control installer").
  - `business_about` — short paragraph / differentiators the model can draw on.
  - `brand_voice` — tone/style guidance (e.g. "warm, consultative, no jargon").
- **Resolution order:** tenant value → org default → **neutral fallback** (never
  "MSP"). Existing tenants keep working immediately, just less tailored.

## Data model (one migration)
- `tenant_settings`: `business_type text`, `business_about text`, `brand_voice text` (all nullable).
- `organizations`: `default_business_type text`, `default_business_about text`, `default_brand_voice text` (nullable) — org-wide defaults.
- Caps enforced in the UI/resolver: type ≤ 120 chars, about ≤ 1000, voice ≤ 500
  (token + caching predictability).

## Resolver (shared by ALL AI features)
`lib/ai/brand-profile.ts` → `getBrandProfile(supabase, tenantId)`:
1. read `tenant_settings` (type/about/voice) for the tenant;
2. if the tenant has `organization_id`, read the org's `default_*`;
3. per field: `tenant value ?? org default ?? null`;
4. return `{ businessName, businessType, about, brandVoice }` (businessName = tenant name).

Used by `/api/ai/draft` now, and by `/api/ai/write` (Gemini generate/continue) +
the Phase-2 `/api/ai/outline` so voice is consistent everywhere.

## Prompt assembly change (`/api/ai/draft`)
Replace the fixed MSP role line with a built header:
```
You are an expert proposal writer for {businessName}{businessType ? ` — a ${businessType}` : ""}, drafting the narrative body of a client-facing proposal.
{about    ? `About ${businessName}: ${about}.` : ""}
{brandVoice ? `Write in this brand voice: ${brandVoice}.` : "Write in a confident, professional, client-facing voice."}

[unchanged hard rules: ground in Quote Data, never invent prices/dates,
 reference the pricing table, [confirm: …] placeholders, GFM only, no tables]
```
Empty fields are omitted; with nothing set, the role is the neutral
`"expert proposal writer for {businessName}"`. Per-tenant system prompt is fine
for prompt caching (stable within a tenant).

## UI
- **Tenant (owner-only):** a "Proposal voice" card in Settings (`settings-client.tsx`)
  — three inputs (type / about / voice), saved to `tenant_settings` via the
  existing settings upsert. Shows the inherited org default as placeholder/help
  text when the tenant field is blank.
- **Org Admin:** a "Default proposal voice" section in `/org`
  (`components/org/org-client.tsx` or the org edit modal) writing the
  `organizations.default_*` columns via a service-role route
  (`PATCH /api/admin/orgs/[id]` / a new org-scoped route).
- **Onboarding:** add a "Describe your business & voice" step to the owner
  onboarding checklist (blank profile → generic drafts).

## Phasing
1. Migration + `getBrandProfile` resolver + wire into `/api/ai/draft` (de-hardcodes
   MSP immediately; neutral fallback covers un-filled tenants).
2. Settings "Proposal voice" card (tenant owner).
3. `/org` org-default editor (Org Admin) + inheritance placeholder in Settings.
4. Wire the resolver into `/api/ai/write` and the Phase-2 `/api/ai/outline`.
5. Onboarding checklist step.

## Out of scope (now)
Per-quote voice override (the Phase-2 intake's tone/emphasis covers per-proposal
nuance); value-prop bullet list (can add to the profile later); voice presets.
