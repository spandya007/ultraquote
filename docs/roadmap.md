# UltraQuote — Future Roadmap

Parked ideas that are designed/understood but not yet scheduled. Not a commitment —
a place so we don't lose them. Move an item into a branch + design doc when picked up.

## AI proposal drafting

### Proposal coach (AI Draft Phase 4)
A side panel / pre-send check that reviews the drafted proposal and flags gaps —
so a rep ships a tighter document. Candidate checks:
- **Missing sections** — no scope, no next-steps/CTA, no "why us", etc.
- **Unreferenced pricing** — scenarios exist but the document never places a pricing table.
- **Unfilled placeholders** — leftover `[confirm: …]` brackets from a draft.
- **Tone/voice drift** — sections that read off-brand vs. the Proposal Voice.
- **Signing readiness** — a signature/acceptance/terms block is expected but absent.
Surfaced as non-blocking suggestions ("Fix" / "Dismiss"), never auto-editing.
Grounding + brand profile already exist; this is a new read-only analysis pass
(likely one Claude call returning structured findings).

### Semantic retrieval of similar proposals
Auto-suggest the best 1–2 past proposals as AI Draft style references (today the
user picks them manually in the Guided-draft intake). Needs embeddings + a vector
index; only worth it at higher quote volume.

## Brand voice
- **Onboarding nudge** — prompt a new owner to fill in Settings → Proposal Voice
  (blank = generic drafts). Small dashboard checklist item.

## Platform / orgs
- **Org-level `platform_enabled` enforcement** — disabling an Organization does not
  yet gate its workspaces in the access resolver. Pairs with the Stripe billing work.
