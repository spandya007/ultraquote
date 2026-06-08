# BlockNote Upgrade & Two-Column Support — Research & Plan

Status: **Backlog (not started).** Reference doc for a future dedicated effort.
Last researched: 2026-06 (BlockNote latest was **0.51.4**).

## Why

1. **Two-column document layout** — requested feature. Only available via
   `@blocknote/xl-multi-column`, which needs a newer BlockNote major than our pinned 0.14.
2. **Fixes the `getPos` crash** — the "Position undefined out of range" bug with custom
   `content:"none"` blocks under React StrictMode is a 0.14 issue. Upgrading should let us
   **re-enable `reactStrictMode`** and simplify the empty-init + `replaceBlocks`-in-rAF workaround.
3. ~37 versions of accumulated fixes.

## Current state (what we're upgrading from)

- `@blocknote/core` 0.14.5, `@blocknote/react` 0.14.6, `@blocknote/mantine` 0.14.6 (package.json pins `^0.14.4`).
- Heavy custom usage in `components/quotes/proposal-editor.tsx` (~26 touchpoints):
  - Custom blocks via `createReactBlockSpec`: `pageBreak` (`content:"none"`) and
    `scenarioTable` (`content:"none"` + `propSchema:{ scenarioRef }`).
  - `BlockNoteSchema.create({ blockSpecs: { ...defaultBlockSpecs, pageBreak, scenarioTable } })`.
  - Slash menu: `getDefaultReactSlashMenuItems`, `SuggestionMenuController`, `filterSuggestionItems`.
  - `insertInlineContent` (Insert Field tokens), `updateBlock` (alignment).
  - Direct `editor._tiptapEditor` access: `insertContentAt` (AI apply), `chain().undo()/redo()`,
    `state.selection` / `doc.textBetween` (AI selection + gather tables).
  - `tryParseMarkdownToBlocks` (.md import); custom `lib/import/html-to-blocks.ts` for .docx tables.
  - `replaceBlocks` (load saved content), `insertBlocks` (import).
  - Table content model (`{ type:"tableContent", rows:[{ cells: InlineContent[][] }] }`) consumed by
    `lib/import/html-to-blocks.ts`, `lib/pdf/serialize.ts`, and the pricing-extraction table gather.

## Confirmed breaking changes (0.14 → 0.51)

1. **`createReactBlockSpec` is now a factory.** Signature:
   `createReactBlockSpec(config, impl, extensions?) => (options?) => BlockSpec`.
   Register **called**: `blockSpecs: { alert: createAlert() }`.
   → Rewrite `pageBreak` and `scenarioTable` to the factory form.
2. **Schema creation uses `.extend()`** and no longer spreads defaults:
   `BlockNoteSchema.create().extend({ blockSpecs: { x: x() } })`.
   → Rewrite our `schema` definition.
3. **Render signature**: `React.FC<{ block; editor; contentRef? }>` (`contentRef` only for
   `content:"inline"`). `pageBreak` fine; `scenarioTable` close (reads `props.block/props.editor`).
4. **PropSchema**: `{ key: { default, values? } }` or `{ key: { default: undefined, type, values? } }`.
   Our `{ scenarioRef: { default: "recommended" } }` should map cleanly.
5. Likely knock-on changes (verify during work): slash-menu item shape, `_tiptapEditor` access path,
   and the table content model.

## Two-column support (the payoff)

Package: **`@blocknote/xl-multi-column`**. Setup:

```ts
import { withMultiColumn, multiColumnDropCursor, getMultiColumnSlashMenuItems, multiColumnLocales } from "@blocknote/xl-multi-column";
import { locales } from "@blocknote/core";

const editor = useCreateBlockNote({
  schema: withMultiColumn(BlockNoteSchema.create().extend({ blockSpecs: { pageBreak: ..., scenarioTable: ... } })),
  dropCursor: multiColumnDropCursor,
  dictionary: { ...locales.en, multi_column: multiColumnLocales.en },
});
```

- Adds block types **`column`** and **`columnList`** (column has a `width` prop).
- Slash menu: add `getMultiColumnSlashMenuItems(editor)` to our items list.
- **Serializer work:** `lib/pdf/serialize.ts` needs new cases for `columnList`/`column`
  (render as a flex/`column-count` layout) so two-column sections appear in Preview/PDF.

## Biggest risk: existing saved documents

Live `document_content` exists for CMIT-2026-006 / 008 / 009 / 010 (custom blocks + tables).
BlockNote JSON (id/type/props/content/children) is conceptually stable but props/defaults and the
table model may differ across 37 versions.
**Mitigation:** before+after upgrade, load every existing doc and round-trip save in the upgraded
editor; add a small sanitizer if any block fails to load. Keep a DB backup/export of those rows first.

## Migration plan (isolated, reversible)

1. **Git worktree/branch** — keep `main` shippable; rollback = delete branch.
2. Bump `@blocknote/{core,react,mantine}` → 0.51.x; add `@blocknote/xl-multi-column`.
3. Rewrite: schema (`.extend`), `pageBreak` + `scenarioTable` (factory API), slash-menu wiring,
   verify `_tiptapEditor` calls, verify/adjust the table content model across
   `html-to-blocks.ts` + `serialize.ts` + the pricing-table gather.
4. Add `withMultiColumn` + serializer `column`/`columnList` rendering.
5. **Re-enable `reactStrictMode`** in `next.config.mjs`; simplify the rAF/`replaceBlocks` load
   workaround if the `getPos` bug is fixed.
6. **Test matrix:** load each existing doc; Insert Field; Ask AI (improve/generate/continue, apply,
   undo); Import (.docx with tables, .md); tables render; **Extract pricing → scenarios**;
   Preview + PDF round-trip (page breaks, pricing tables, logo, header/footer); save/reload;
   two-column create + PDF.

## Bonus opportunities (out of scope for the upgrade itself)

- Newer BlockNote ships **official DOCX export** and **PDF export** — could later simplify our
  mammoth `.docx` import and possibly the Puppeteer PDF pipeline. Evaluate separately.

## Sources

- Custom Blocks: https://www.blocknotejs.org/docs/features/custom-schemas/custom-blocks
- Multi-Column example: https://www.blocknotejs.org/examples/basic/multi-column
- xl-multi-column (npm): https://www.npmjs.com/package/@blocknote/xl-multi-column
- Document Structure: https://www.blocknotejs.org/docs/foundations/document-structure
- Releases: https://github.com/TypeCellOS/BlockNote/releases
