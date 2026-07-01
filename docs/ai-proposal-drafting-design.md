# AI Proposal Drafting — Design

Status: **proposed** (open questions in §10 to confirm before build)
Builds on the existing AI plumbing: `/api/ai/write` (`lib/ai/gemini.ts`,
`geminiGenerate`, `gemini-2.5-flash`), `/api/ai/extract-pricing` (Gemini JSON
mode), the BlockNote document editor (`components/quotes/proposal-editor.tsx`),
and the import path (`editor.tryParseMarkdownToBlocks` / `lib/import/html-to-blocks.ts`).

## 1. Problem

Today the AI is **reactive** — it edits text the user already wrote (improve /
expand / shorten / grammar / tone / continue) and extracts pricing from an
imported table. The blank Document is still a blank box. Users (MSPs, not
copywriters) stall on *starting* and *structuring* the proposal narrative.

This design makes the AI **proactive**: it leads the user from an empty Document
to a structured, client-specific first draft, grounded in data the quote already
holds (scenarios, line items, client, brand) plus optional exemplars (a template
or a past proposal).

## 2. Core insight

A quote is **already structured data** — `quote_scenarios` + `quote_line_items`
(description, billing_period, quantity, unit_price, setup_price, discounts,
is_taxable), the linked `clients` row, and the `tenants` brand. That *is* the
deal. So we don't need a long questionnaire to learn *what* the proposal is
about — we read it off the quote and ask only for **intent** (tone, length,
emphasis). The model's job is structured-data → narrative, not invention.

This also means **grounding/guardrails are first-class**: a proposal contains
real prices, so the model must never invent line items, numbers, dates, or
commitments. It references the pricing table; it does not restate figures.

## 3. The flow: Intake → Outline → Draft

The proven pattern (Gamma / Tome / Notion AI / Qwilr / PandaDoc) is **not**
"blank box → full draft". It is three steps, each user-controllable:

1. **Intake** — a short modal (3–5 questions), most fields pre-filled from the
   quote. Never ask what we already know.
2. **Outline** — the AI returns a *section list* the user can reorder, rename,
   add to, or remove **before** any prose is generated. This is the most
   important control point — cheap to regenerate, gives the user the wheel.
3. **Draft** — the AI writes each approved section, grounded in the quote data
   (+ exemplars), returned as Markdown → converted to BlockNote blocks →
   inserted. Routed through the existing **preview-before-apply** staging.

## 4. Scope & phasing

| Phase | Feature | Value | Effort | Depends on |
|---|---|---|---|---|
| **1** | **Insert-section menu** — Exec Summary, Scope of Work, Why Us, Timeline, Investment, Next Steps; each generates one grounded section | ★★★ | Low | `blocksToMarkdown`, quote-data context |
| **2** | **Draft with AI** — full Intake → Outline → Draft flow on an empty/active Document | ★★★ | Med | Phase 1 prompt/context plumbing |
| **3** | **Exemplars** — "use a template as skeleton" and "use a past quote as reference" pickers feed the same context block | ★★ | Low–Med | Phase 2 |
| **4 (later)** | **Proposal coach** — side panel flags missing sections / unreferenced pricing / tone drift | ★★ | Med | — |
| **Out of scope (now)** | **Semantic retrieval** of similar past proposals (embeddings/vector index) | ★ now | High | See §11 |

Phase 1 is the fastest win and builds every reusable piece (context assembly +
Markdown→blocks). Phases 2–3 are then mostly UX.

## 5. Context assembly (the part you were unsure about)

Three reusable helpers feed every AI-drafting call. All run **server-side** in
the new routes (consistent with `/api/ai/write`).

### 5.1 `quoteContextMarkdown(quoteId)` — structured deal data
Reuse `loadSerializeInput()` (`lib/pdf/load.ts`) — it already fetches scenarios +
line items + client + tenant. Render a compact Markdown summary (NOT HTML):

```
## Client
Acme Corp — Jane Doe (jane@acme.test) — Manufacturing

## Your company
CMIT Hayward

## Scenarios & pricing (do not restate these numbers in prose)
### Recommended: "Managed + Security"
| Service | Qty | Billing | Unit | Setup |
|---------|-----|---------|------|-------|
| Managed Workstation | 25 | Monthly | $75 | $25 |
| ...
Monthly total: $X · One-time: $Y
```

The pricing exists so the model can *speak to* the scope, not to copy figures —
the live pricing table block remains the source of truth in the Document.

### 5.2 `blocksToMarkdown(documentContent)` — serialize a doc for the prompt
New light serializer: BlockNote JSON → Markdown (headings, lists, paragraphs,
tables; strip inline styling/images). Mirrors `lib/pdf/serialize.ts` but targets
Markdown, not print HTML. Used to turn a **template** or a **past quote** into an
exemplar string. (Don't feed the PDF HTML — too noisy and token-heavy.)

### 5.3 Exemplars
- **Template** (`templates.document_content`) → `blocksToMarkdown` → used as a
  **structure skeleton** ("follow this section structure, fill for this client")
  or a **style sample** ("match this tone"). Distinguish the two intents in UI.
- **Past quote** (`quotes.document_content`, tenant-scoped via RLS) → 1–2
  serialized proposals as **few-shot style exemplars**.

## 6. Prompt design

A draft call composes four parts (Gemini Flash's context window absorbs a couple
of serialized proposals comfortably):

1. **System/instruction** — role + hard guardrails (below).
2. **Quote data** — `quoteContextMarkdown`.
3. **Exemplar(s)** — optional template/past-quote Markdown, clearly labelled as
   *examples of structure/style, not facts to copy*.
4. **Task** — outline request, or "draft section: <name>", or "draft the whole
   outline" + intake answers (tone/length/emphasis).

**Guardrails (verbatim in the instruction):**
> Use only the services, scope, and prices given in the Quote Data. Never invent
> line items, prices, dates, headcounts, SLAs, or commitments. Refer to the
> pricing table rather than restating figures. Where a detail isn't provided,
> write generally or insert a clearly bracketed placeholder like
> `[confirm: implementation timeline]`. Output GitHub-flavored Markdown only.

The placeholder convention turns hallucination pressure into explicit TODOs the
user can fill — a pattern users trust.

## 7. Output → blocks

Model returns **Markdown** (not BlockNote JSON — more reliable from an LLM).
Convert with the path the import feature already uses:
- `editor.tryParseMarkdownToBlocks(md)` → blocks, then `editor.insertBlocks(...)`
  at the cursor (section insert) or `editor.replaceBlocks(...)` for a full draft
  into an empty doc.
- The Markdown→blocks plumbing already exists for `.md`/`.docx` import, so the
  "AI → Document" wiring is largely built. Pricing tables stay as the dedicated
  `scenarioTable` block (the AI references them; it does not render them).

All generations land in the **existing preview-before-apply modal** (the staged
Replace/Discard from `/api/ai/write`) so nothing overwrites the Document silently.

## 8. API shape

Two new routes, same conventions as `/api/ai/write` (auth + `requireWriteAccess`
gate + `GEMINI_API_KEY` check + `geminiGenerate`/`geminiErrorMessage`):

| Route | Body | Returns |
|---|---|---|
| `POST /api/ai/outline` | `{ quoteId, intake: { tone, length, emphasis?, mustInclude?[] }, templateId?, referenceQuoteIds?[] }` | `{ sections: [{ title, hint }] }` (JSON mode, like extract-pricing) |
| `POST /api/ai/draft` | `{ quoteId, section?: string, sections?: string[], intake, templateId?, referenceQuoteIds?[] }` | `{ markdown }` |

`section` drafts one (Insert-section menu / Phase 1); `sections` drafts the whole
approved outline (Phase 2). Outline uses Gemini JSON mode exactly like
`/api/ai/extract-pricing` (`responseMimeType: application/json`).

## 9. UX

- **Empty Document state** — a soft "✦ Draft with AI" call-to-action card
  (dismissible; progressive disclosure — never forced). Mirrors the onboarding
  checklist pattern.
- **Insert-section menu** (Phase 1) — a toolbar dropdown in `proposal-editor.tsx`
  next to "Insert"/"Ask AI": pick a section → grounded content staged in the
  preview modal.
- **Intake modal** (Phase 2) — tone (segmented), length (short/standard/detailed),
  optional emphasis free-text, optional must-include checklist. Client/services
  shown read-only ("pulled from this quote") — reinforces pre-fill.
- **Outline editor** (Phase 2) — editable list (reorder / rename / add / remove /
  regenerate) before drafting. The control point.
- **Reference picker** (Phase 3) — "Start from template" already exists at quote
  creation; add an in-editor "Reference a past proposal" picker (tenant-scoped).
- Consistent with existing boundaries: feature popovers stay light-themed; AI
  modals reuse the established staging UI.

## 10. Decisions (confirmed 2026-06-29)

- **Q1 — Model:** **Claude `claude-opus-4-8`** for the heavy `/api/ai/draft` +
  `/api/ai/outline` paths (official `@anthropic-ai/sdk`); Gemini Flash stays for
  the existing `/api/ai/write` inline ops. Built provider-split at the `lib/ai`
  layer (`lib/ai/claude.ts` alongside `lib/ai/gemini.ts`).
- **Q2 — Access:** any quote **editor** (auth + `requireWriteAccess`, mirrors
  `/api/ai/write`). Not owner-only — it writes only `document_content`.
- **Q3 — Reference scope:** **all tenant quotes** the user can read (RLS-scoped).
- **Q4 — Intake:** **3 questions** (tone, length, optional emphasis).
- **Q5 — Exemplar caps:** ≤2 reference proposals, each truncated (~6k chars),
  like extract-pricing's `slice()`.
- **Env:** new `ANTHROPIC_API_KEY` (Console + billing) in `.env.local` + Netlify.

### Original open questions (for history)

- **Q1 — Model strategy.** Keep everything on `gemini-2.5-flash`, or route the
  heavy *draft* path to a more capable model while keeping Flash for cheap inline
  ops (tiered)? Full-proposal drafting is customer-facing and quality-sensitive;
  a tiered split (e.g. a stronger model for `/api/ai/draft`, Flash for
  `/api/ai/write`) is worth an A/B. **Recommendation: build provider-agnostic at
  the `lib/ai` layer so the draft route's model is a one-line swap.**
- **Q2 — Owner-only, or all editors?** `/api/ai/write` is gated by
  `requireWriteAccess` (any editor of the quote). Drafting writes only to
  `document_content` (no catalog/products), so **recommend: same as write — any
  user who can edit the quote.** (Contrast: extract-pricing is owner-only because
  it can create catalog products.)
- **Q3 — Reference scope.** Past-quote exemplars limited to the user's own
  quotes, or any tenant quote they can read? RLS already scopes to tenant;
  **recommend tenant-wide read** (reuse the best proposals in the org).
- **Q4 — Intake depth.** 3 questions (tone/length/emphasis) vs 5 (+ pain point,
  must-include). **Recommend start at 3**, add only if drafts feel generic.
- **Q5 — Token budget for exemplars.** Cap serialized exemplars (e.g. ≤2 past
  quotes, truncate each like extract-pricing's `slice(0, 12000)`).

## 11. Out of scope (now) — semantic retrieval

Auto-suggesting the *most similar* past proposals (by client industry / services)
needs embeddings + a vector index (pgvector) + an indexing pipeline. Only worth
it once tenants have dozens of quotes and *finding* the right reference is the
friction. Until then, **manual selection (Phase 3) is the 80/20.** Revisit as a
dedicated effort; pairs naturally with a future catalog/quote search.

## 12. Suggested build order
1. `blocksToMarkdown` + `quoteContextMarkdown` helpers (shared plumbing).
2. `POST /api/ai/draft` (single-section) + **Insert-section menu** (Phase 1).
3. `POST /api/ai/outline` + **Intake → Outline → Draft** flow (Phase 2).
4. Template-skeleton + past-quote reference pickers (Phase 3).
5. Revisit coach (Phase 4) and semantic retrieval (§11) later.
