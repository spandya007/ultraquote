# Document editor: toolbar "Insert" menu for Pricing Table + Signature (+ Page Break)

> **Priority: HIGH (launch usability).** UltraQuote users are business owners who aren't tech-savvy.
> Today, inserting a **Pricing table**, **Signature**, or **Page break** into the proposal Document
> requires typing the slash command (`/pricing`, `/signature`, `/page break`), which feels hacky and is
> undiscoverable. Surface these in the toolbar so they're clickable. Flagged a launch blocker by the
> user (2026-06-16).

## Current state (verified in `components/quotes/proposal-editor.tsx`)
- Custom blocks already exist: `scenarioTable` (prop `scenarioRef`, default `"recommended"`),
  `signatureField` (prop `signer`, default `"client"`), `pageBreak`.
- They're inserted **only via the slash menu** today, each with a one-liner, e.g.:
  ```ts
  editor.insertBlocks(
    [{ type: "scenarioTable", props: { scenarioRef: "recommended" } }],
    editor.getTextCursorPosition().block, "after");
  ```
- The toolbar already has an **"Insert Field"** dropdown that inserts inline `{{client.*}}`/`{{tenant.*}}`
  tokens via `editor.insertInlineContent(...)`.
- An `insertBlocksIntoDoc()` helper already appends-at-end when there's no cursor.

So this is **UI wiring of existing insert calls** — no new block logic. Low effort, low risk.

## Recommended approach
**Rename "Insert Field" → "Insert ▾"** and group the dropdown into two sections:
1. **Client & company details** — the current inline token items (drop the jargony word "Field"; use
   plain labels like "Company name", "Contact email").
2. **Building blocks** — **Pricing table**, **Signature**, **Page break** — each with an icon + a
   one-line description (reuse the existing slash subtexts, e.g. "Insert a scenario's pricing").

Mechanics:
- Wire each block item to the **same `editor.insertBlocks([...], getTextCursorPosition().block, "after")`**
  the slash menu uses; **fall back to `insertBlocksIntoDoc` (append)** if there's no cursor (toolbar
  clicks can blur the editor — the existing "Insert Field" dropdown already inserts from the toolbar, so
  the pattern is proven).
- **Defaults:** Pricing table → `scenarioRef:"recommended"`, Signature → `signer:"client"`. Each block
  renders an inline `<select>` to change scenario/signer after insertion (already implemented), so no
  prompt needed.
- **Keep the slash commands** working (power users); this is an additional path.
- Add **icons** (table / signature-pen / page-break) and friendly labels for non-technical users.

### Alternative (decide with user)
Two **dedicated toolbar buttons** ("Pricing table", "Signature") for one-click access since they're the
most-used, keeping "Insert Field" for tokens. More discoverable per-action but more toolbar clutter.
**Lean: the grouped "Insert ▾" menu** (cleaner, scalable). Open question recorded for confirmation.

## Touch points
- `components/quotes/proposal-editor.tsx` — the toolbar dropdown (currently "Insert Field" near the
  alignment buttons) + reuse the existing insert calls. No schema/serializer changes.

## Notes
- Safe on **BlockNote 0.14** (our own toolbar React) and compatible with the planned 0.51 upgrade (#10);
  don't block on the upgrade — do this now.
- After build: quick check that inserting from the toolbar lands at the cursor, the in-block
  scenario/signer dropdowns still work, and the Send flow still detects the signature block
  (`onSignatureFieldsChange`).
