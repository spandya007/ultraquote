"use client";

import { useEffect, useRef, useCallback, useState, createContext, useContext } from "react";
import {
  useCreateBlockNote,
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from "@blocknote/core";
import { en as enLocale } from "@blocknote/core/locales";
import {
  withMultiColumn,
  multiColumnDropCursor,
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from "@blocknote/xl-multi-column";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "next-themes";
import { AlignLeft, AlignCenter, AlignRight, Scissors, ChevronDown, Table2, Sparkles, Loader2, Undo2, Redo2, Check, X, FileUp, ListPlus, AlertTriangle, BookTemplate, PenLine, CheckSquare, CircleDot, Columns2, Keyboard } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { scenarioColor } from "@/lib/scenario-colors";
import { composeAddress } from "@/lib/clients/address";
import { htmlToBlocks } from "@/lib/import/html-to-blocks";
import { stripMarkdownTables } from "@/lib/ai/strip-markdown-tables";
import { createClient } from "@/lib/supabase/client";
import { useTenantId } from "@/lib/supabase/use-tenant";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

// Small keyboard-key chip for the editor hints bar.
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 py-px rounded border bg-background text-[10px] font-medium text-foreground/70 not-italic">
      {children}
    </kbd>
  );
}

// ─── Custom: Page Break block ─────────────────────────────────────────────────

const PageBreakBlock = createReactBlockSpec(
  {
    type: "pageBreak" as const,
    propSchema: {},
    content: "none",
  },
  {
    render: () => (
      <div
        className="page-break-block"
        data-page-break="true"       // used by Puppeteer PDF generator
        contentEditable={false}
        style={{ width: "100%", userSelect: "none" }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 0",
          color: "#94a3b8",
          fontSize: "11px",
          fontFamily: "sans-serif",
        }}>
          <div style={{ flex: 1, borderTop: "2px dashed #cbd5e1" }} />
          <span style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: "4px",
            padding: "2px 8px",
            whiteSpace: "nowrap",
          }}>
            ✂ Page Break
          </span>
          <div style={{ flex: 1, borderTop: "2px dashed #cbd5e1" }} />
        </div>
      </div>
    ),
  }
);

// ─── Custom: Signature field block ────────────────────────────────────────────
// Marks where a party signs. `signer` = "client" or "tenant" (your company).
// In the normal Preview/PDF it renders a signature line; in the DocuSeal signing
// copy the serializer emits a {{...;role=...;type=signature}} field tag.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SignatureFieldView({ block, editor }: { block: any; editor: any }) {
  const signer: string = block.props?.signer ?? "client";
  return (
    <div contentEditable={false} style={{ userSelect: "none", margin: "8px 0" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        border: "1px dashed #93c5fd", background: "#eff6ff", color: "#1e40af",
        borderRadius: 6, padding: "8px 12px", fontSize: 12,
      }}>
        <span>✍ Signature field —</span>
        <select
          value={signer}
          onChange={(e) => editor.updateBlock(block, { props: { signer: e.target.value } })}
          style={{ fontSize: 12, padding: "1px 4px", borderRadius: 4, border: "1px solid #bfdbfe", background: "#fff", color: "#1e40af" }}
        >
          <option value="client">Client signs here</option>
          <option value="client2">Secondary contact signs here</option>
          <option value="tenant">My company signs here</option>
        </select>
      </div>
    </div>
  );
}

const SignatureFieldBlock = createReactBlockSpec(
  {
    type: "signatureField" as const,
    propSchema: { signer: { default: "client" } },
    content: "none",
  },
  {
    render: (props) => <SignatureFieldView block={props.block} editor={props.editor} />,
  }
);

// ─── Custom: Acceptance checkbox block ────────────────────────────────────────
// A statement the CUSTOMER must check before signing. In normal Preview/PDF it
// renders a checkbox + statement; in the DocuSeal signing copy the serializer
// emits a required <checkbox-field role="Client">, so the customer can't
// complete signing without checking it.
const DEFAULT_ACCEPT_LABEL = "I have read and accept the terms of this proposal.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AcceptanceFieldView({ block, editor }: { block: any; editor: any }) {
  const label: string = block.props?.label ?? "";
  return (
    <div contentEditable={false} style={{ userSelect: "none", margin: "8px 0" }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        border: "1px dashed #fcd34d", background: "#fffbeb", color: "#92400e",
        borderRadius: 6, padding: "10px 12px", fontSize: 13, maxWidth: 560,
      }}>
        <input type="checkbox" disabled checked={false} readOnly style={{ marginTop: 3 }} />
        <span style={{ flex: 1 }}>
          <input
            type="text"
            value={label}
            placeholder="Statement the customer must accept…"
            onChange={(e) => editor.updateBlock(block, { props: { label: e.target.value } })}
            style={{ width: "100%", fontSize: 13, padding: "2px 6px", borderRadius: 4, border: "1px solid #fde68a", background: "#fff", color: "#92400e" }}
          />
          <span style={{ display: "block", fontSize: 11, marginTop: 4, opacity: 0.8 }}>
            ☑ Required — the customer must check this before they can sign.
          </span>
        </span>
      </div>
    </div>
  );
}

const AcceptanceFieldBlock = createReactBlockSpec(
  {
    type: "acceptanceField" as const,
    propSchema: { label: { default: DEFAULT_ACCEPT_LABEL } },
    content: "none",
  },
  {
    render: (props) => <AcceptanceFieldView block={props.block} editor={props.editor} />,
  }
);

// ─── Custom: Initials field block ─────────────────────────────────────────────
// Marks where a party initials. `signer` = "client" or "tenant". In normal
// Preview/PDF it renders an initials box; in the DocuSeal signing copy the
// serializer emits an <initials-field role=...>.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InitialsFieldView({ block, editor }: { block: any; editor: any }) {
  const signer: string = block.props?.signer ?? "client";
  return (
    <div contentEditable={false} style={{ userSelect: "none", margin: "8px 0" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        border: "1px dashed #93c5fd", background: "#eff6ff", color: "#1e40af",
        borderRadius: 6, padding: "8px 12px", fontSize: 12,
      }}>
        <span>🅰 Initials —</span>
        <select
          value={signer}
          onChange={(e) => editor.updateBlock(block, { props: { signer: e.target.value } })}
          style={{ fontSize: 12, padding: "1px 4px", borderRadius: 4, border: "1px solid #bfdbfe", background: "#fff", color: "#1e40af" }}
        >
          <option value="client">Client initials here</option>
          <option value="client2">Secondary contact initials here</option>
          <option value="tenant">My company initials here</option>
        </select>
      </div>
    </div>
  );
}

const InitialsFieldBlock = createReactBlockSpec(
  {
    type: "initialsField" as const,
    propSchema: { signer: { default: "client" } },
    content: "none",
  },
  {
    render: (props) => <InitialsFieldView block={props.block} editor={props.editor} />,
  }
);

// ─── Custom: Multiple-choice (radio) field block ──────────────────────────────
// A question with options the signer must pick one of. `signer` = client|tenant,
// `options` = comma-separated choices. Signing mode emits a DocuSeal <radio-field>.
const DEFAULT_RADIO_LABEL = "Please choose one:";
const DEFAULT_RADIO_OPTIONS = "Option A, Option B";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RadioFieldView({ block, editor }: { block: any; editor: any }) {
  const label: string = block.props?.label ?? "";
  const options: string = block.props?.options ?? "";
  const signer: string = block.props?.signer ?? "client";
  // Radio options render as small labelled boxes in the signed PDF; long
  // options wrap badly. Nudge the author to keep them short.
  const longOpts = options.split(",").map(o => o.trim()).filter(o => o.length > 30);
  return (
    <div contentEditable={false} style={{ userSelect: "none", margin: "8px 0" }}>
      <div style={{
        display: "flex", flexDirection: "column", gap: 6,
        border: "1px dashed #93c5fd", background: "#eff6ff", color: "#1e40af",
        borderRadius: 6, padding: "10px 12px", fontSize: 13, maxWidth: 560,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>◉ Multiple choice —</span>
          <select
            value={signer}
            onChange={(e) => editor.updateBlock(block, { props: { signer: e.target.value } })}
            style={{ fontSize: 12, padding: "1px 4px", borderRadius: 4, border: "1px solid #bfdbfe", background: "#fff", color: "#1e40af" }}
          >
            <option value="client">Client chooses</option>
            <option value="tenant">My company chooses</option>
          </select>
        </div>
        <input
          type="text"
          value={label}
          placeholder="Question…"
          onChange={(e) => editor.updateBlock(block, { props: { label: e.target.value } })}
          style={{ width: "100%", fontSize: 13, padding: "2px 6px", borderRadius: 4, border: "1px solid #bfdbfe", background: "#fff", color: "#1e40af" }}
        />
        <input
          type="text"
          value={options}
          placeholder="Options, comma-separated (e.g. Monthly, Annual)"
          onChange={(e) => editor.updateBlock(block, { props: { options: e.target.value } })}
          style={{ width: "100%", fontSize: 13, padding: "2px 6px", borderRadius: 4, border: "1px solid #bfdbfe", background: "#fff", color: "#1e40af" }}
        />
        <span style={{ fontSize: 11, opacity: 0.8 }}>Required — the signer must pick one option.</span>
        {longOpts.length > 0 && (
          <span style={{ fontSize: 11, color: "#b45309", fontWeight: 500 }}>
            ⚠ Keep options short (a few words). Put any detail in the question above — long options wrap awkwardly in the signed PDF.
          </span>
        )}
      </div>
    </div>
  );
}

const RadioFieldBlock = createReactBlockSpec(
  {
    type: "radioField" as const,
    propSchema: { label: { default: DEFAULT_RADIO_LABEL }, options: { default: DEFAULT_RADIO_OPTIONS }, signer: { default: "client" } },
    content: "none",
  },
  {
    render: (props) => <RadioFieldView block={props.block} editor={props.editor} />,
  }
);

// ─── Custom: Scenario / Pricing table block ───────────────────────────────────
// Stores a *reference* (scenarioRef), not a snapshot — so the table stays live
// as line items are edited. Live scenario data is supplied via React context
// (BlockNote block render functions can't receive parent props directly).

export interface EditorLineItem {
  description: string;
  details?: string | null;
  billing_period: "Monthly" | "One Time" | null;
  quantity: number;
  unit_price: number | null;
  unit_cost: number | null;
  setup_price?: number | null;
  is_taxable: boolean;
  discount_percent?: number | null;
  discount_amount?: number | null;
}

// Revenue for a line after its discount (percent or fixed $, floored at 0).
function editorLineRev(i: EditorLineItem) {
  const gross = i.quantity * (i.unit_price ?? 0);
  return Math.max(gross * (1 - (i.discount_percent ?? 0) / 100) - (i.discount_amount ?? 0), 0);
}
export interface EditorScenario {
  id: string;
  name: string;
  is_recommended: boolean;
  sort_order: number;
  line_items: EditorLineItem[];
}
interface ScenarioCtx {
  scenarios: EditorScenario[];
  taxRate: number;
  showMargins: boolean;
}
const ScenarioContext = createContext<ScenarioCtx>({ scenarios: [], taxRate: 0, showMargins: false });

function lineMargin(i: EditorLineItem): number | null {
  const eff = (i.unit_price ?? 0) * (1 - (i.discount_percent ?? 0) / 100);
  if (i.unit_price == null || i.unit_cost == null || eff <= 0) return null;
  return ((eff - i.unit_cost) / eff) * 100;
}
function marginColor(pct: number | null): string {
  if (pct == null) return "#94a3b8";
  return pct >= 30 ? "#16a34a" : pct >= 15 ? "#ca8a04" : "#dc2626";
}

function scenarioMonthly(s: EditorScenario) {
  return s.line_items.filter(i => i.billing_period === "Monthly").reduce((sum, i) => sum + editorLineRev(i), 0);
}
function scenarioSetup(s: EditorScenario) {
  return s.line_items.reduce((sum, i) => sum + i.quantity * (i.setup_price ?? 0), 0);
}
function scenarioOnetime(s: EditorScenario) {
  // Setup fees are one-time → folded into the one-time total (matches the
  // editor totals + PDF serializer).
  return s.line_items.filter(i => i.billing_period === "One Time").reduce((sum, i) => sum + editorLineRev(i), 0)
    + scenarioSetup(s);
}
function scenarioSavings(s: EditorScenario) {
  return s.line_items.reduce(
    (sum, i) => sum + (i.quantity * (i.unit_price ?? 0) - editorLineRev(i)), 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScenarioTableView({ block, editor }: { block: any; editor: any }) {
  const { scenarios, showMargins } = useContext(ScenarioContext);
  const ref: string = block.props?.scenarioRef ?? "recommended";
  // Columns: Description, Billing, Qty, Unit Price, Total (+ Margin when on).
  const cols = showMargins ? 6 : 5;

  const sorted = [...scenarios].sort((a, b) => a.sort_order - b.sort_order);
  let shown: EditorScenario[];
  if (ref === "all") shown = sorted;
  else if (ref === "recommended") {
    const rec = sorted.find(s => s.is_recommended);
    shown = rec ? [rec] : sorted.slice(0, 1);
  } else {
    const found = sorted.find(s => s.id === ref);
    shown = found ? [found] : [];
  }

  return (
    <div contentEditable={false} style={{ userSelect: "none", margin: "8px 0", width: "100%" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
        fontSize: 11, color: "#6b7280",
      }}>
        <Table2 className="w-3.5 h-3.5" />
        <span style={{ fontWeight: 600 }}>Pricing table</span>
        <select
          value={ref}
          onChange={(e) => editor.updateBlock(block, { props: { scenarioRef: e.target.value } })}
          style={{
            fontSize: 11, padding: "1px 4px", borderRadius: 4,
            border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#5b21b6",
          }}
        >
          <option value="recommended">Recommended scenario</option>
          <option value="all">All scenarios</option>
          {sorted.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
          {scenarios.length === 0
            ? "Pricing table placeholder — will use the quote's scenarios when this template is applied."
            : "Referenced scenario no longer exists — pick another above."}
        </div>
      ) : shown.map(s => {
        const monthly = scenarioMonthly(s);
        const onetime = scenarioOnetime(s);
        const setup = scenarioSetup(s);
        const savings = scenarioSavings(s);
        const hasDisc = s.line_items.some(i => (i.discount_percent ?? 0) > 0 || (i.discount_amount ?? 0) > 0);
        const tcols = cols + (hasDisc ? 1 : 0);
        const c = scenarioColor(sorted.findIndex(x => x.id === s.id));
        const th = { padding: "4px 8px", border: `1px solid ${c.border}`, background: c.footBg, color: c.headText, fontWeight: 600 as const, fontSize: 10 };
        const td = { padding: "4px 8px", border: "1px solid #f1f5f9" };
        const tdR = { ...td, textAlign: "right" as const };
        return (
          <table key={s.id} style={{
            width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 11,
            border: `1px solid ${c.border}`,
            // This live-preview <table> is display-only. Make it transparent to
            // pointer events so BlockNote's table-handles plugin never resolves
            // it to this custom block (which has content:"none" / no rows) and
            // crashes its mousemove handler reading content.rows. Nothing here is
            // interactive (the scenario <select> is a sibling above the table).
            pointerEvents: "none",
          }}>
            <thead>
              <tr>
                <th colSpan={tcols} style={{
                  textAlign: "left", background: c.headBg, color: c.headText,
                  padding: "6px 8px", border: `1px solid ${c.border}`, fontSize: 12,
                }}>
                  {s.name}{s.is_recommended ? " ★" : ""}
                </th>
              </tr>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Item</th>
                <th style={{ ...th, textAlign: "left" }}>Billing</th>
                <th style={{ ...th, textAlign: "right" }}>Qty</th>
                <th style={{ ...th, textAlign: "right" }}>Unit Price</th>
                {hasDisc && <th style={{ ...th, textAlign: "right" }}>Discount</th>}
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                {showMargins && <th style={{ ...th, textAlign: "right" }}>Margin</th>}
              </tr>
            </thead>
            <tbody>
              {s.line_items.length === 0 ? (
                <tr><td colSpan={tcols} style={{ padding: "6px 8px", color: "#94a3b8", textAlign: "center" }}>No line items</td></tr>
              ) : s.line_items.map((i, idx) => {
                const m = lineMargin(i);
                return (
                <tr key={idx}>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{i.description}</span>
                    {i.quantity * (i.setup_price ?? 0) > 0 && (
                      <span style={{ display: "block", fontSize: 10, color: "#64748b", marginTop: 2 }}>
                        + {formatCurrency(i.quantity * (i.setup_price ?? 0))} setup (one-time)
                      </span>
                    )}
                    {i.details && (
                      <span style={{ display: "block", fontSize: 10, color: "#64748b", marginTop: 2, paddingLeft: 12, whiteSpace: "pre-wrap" }}>
                        {i.details}
                      </span>
                    )}
                  </td>
                  <td style={td}>{i.billing_period ?? "—"}</td>
                  <td style={tdR}>{Math.round(i.quantity)}</td>
                  <td style={tdR}>{formatCurrency(i.unit_price ?? 0)}</td>
                  {hasDisc && (
                    <td style={tdR}>
                      {(i.discount_percent ?? 0) > 0 ? `−${i.discount_percent}%`
                        : (i.discount_amount ?? 0) > 0 ? `−${formatCurrency(i.discount_amount ?? 0)}` : "—"}
                    </td>
                  )}
                  <td style={tdR}>{formatCurrency(editorLineRev(i))}</td>
                  {showMargins && (
                    <td style={{ ...tdR, color: marginColor(m), fontWeight: 600 }}>
                      {m != null ? `${m.toFixed(1)}%` : "—"}
                    </td>
                  )}
                </tr>
              );})}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={hasDisc ? 5 : 4} style={{ padding: "4px 8px", textAlign: "right", background: c.footBg, color: c.footText }}>Monthly</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, background: c.footBg, color: c.footText }}>{formatCurrency(monthly)}</td>
                {showMargins && <td style={{ background: c.footBg }} />}
              </tr>
              <tr>
                <td colSpan={hasDisc ? 5 : 4} style={{ padding: "4px 8px", textAlign: "right", background: c.footBg, color: c.footText }}>
                  One-time{setup > 0 ? <span style={{ fontWeight: 400, opacity: 0.75 }}> (incl. {formatCurrency(setup)} setup)</span> : ""}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, background: c.footBg, color: c.footText }}>{formatCurrency(onetime)}</td>
                {showMargins && <td style={{ background: c.footBg }} />}
              </tr>
              {savings > 0 && (
                <tr>
                  <td colSpan={hasDisc ? 5 : 4} style={{ padding: "4px 8px", textAlign: "right", background: "#f0fdf4", color: "#16a34a", fontWeight: 700 }}>You save</td>
                  <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, background: "#f0fdf4", color: "#16a34a" }}>{formatCurrency(savings)}</td>
                  {showMargins && <td style={{ background: "#f0fdf4" }} />}
                </tr>
              )}
            </tfoot>
          </table>
        );
      })}
    </div>
  );
}

const ScenarioTableBlock = createReactBlockSpec(
  {
    type: "scenarioTable" as const,
    propSchema: { scenarioRef: { default: "recommended" } },
    content: "none",
  },
  {
    render: (props) => <ScenarioTableView block={props.block} editor={props.editor} />,
  }
);

// Schema that includes the custom blocks
// Flatten the document tree (recurse children) so detection of pricing/signature
// blocks isn't limited to the top level — blocks nested inside columns (or any
// other container) must be found too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenBlocks(blocks: any[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (const b of blocks ?? []) {
    out.push(b);
    if (Array.isArray(b.children) && b.children.length) out.push(...flattenBlocks(b.children));
  }
  return out;
}

// withMultiColumn adds the `column` / `columnList` blocks (two-column layout).
const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      // 0.51: createReactBlockSpec returns a factory — call it to register.
      pageBreak: PageBreakBlock(),
      scenarioTable: ScenarioTableBlock(),
      signatureField: SignatureFieldBlock(),
      acceptanceField: AcceptanceFieldBlock(),
      initialsField: InitialsFieldBlock(),
      radioField: RadioFieldBlock(),
    },
  })
);

// Slash-menu item for inserting a page break
function getPageBreakSlashItem(editor: typeof schema.BlockNoteEditor) {
  return {
    title: "Page Break",
    subtext: "Insert a page break for PDF output",
    onItemClick: () => {
      editor.insertBlocks(
        [{ type: "pageBreak" }],
        editor.getTextCursorPosition().block,
        "after"
      );
    },
    aliases: ["pagebreak", "page", "break", "newpage"],
    group: "Layout",
    icon: <Scissors className="w-4 h-4" />,
  };
}

// Slash-menu item for inserting a scenario/pricing table
function getScenarioSlashItem(editor: typeof schema.BlockNoteEditor) {
  return {
    title: "Pricing Table",
    subtext: "Insert a scenario's pricing into the document",
    onItemClick: () => {
      editor.insertBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ type: "scenarioTable", props: { scenarioRef: "recommended" } } as any],
        editor.getTextCursorPosition().block,
        "after"
      );
    },
    aliases: ["scenario", "pricing", "price", "table", "quote"],
    group: "Layout",
    icon: <Table2 className="w-4 h-4" />,
  };
}

// Slash-menu item for inserting a signature field
function getSignatureSlashItem(editor: typeof schema.BlockNoteEditor) {
  return {
    title: "Signature Field",
    subtext: "Place where a party signs (for Send for signature)",
    onItemClick: () => {
      editor.insertBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ type: "signatureField", props: { signer: "client" } } as any],
        editor.getTextCursorPosition().block,
        "after"
      );
    },
    aliases: ["signature", "sign", "esign", "docuseal"],
    group: "Layout",
    icon: <PenLine className="w-4 h-4" />,
  };
}

// Slash-menu item for inserting an acceptance checkbox (customer must check before signing)
function getAcceptanceSlashItem(editor: typeof schema.BlockNoteEditor) {
  return {
    title: "Acceptance Checkbox",
    subtext: "A statement the customer must check before signing",
    onItemClick: () => {
      editor.insertBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ type: "acceptanceField" } as any],
        editor.getTextCursorPosition().block,
        "after"
      );
    },
    aliases: ["accept", "acceptance", "checkbox", "consent", "agree", "acknowledge"],
    group: "Layout",
    icon: <CheckSquare className="w-4 h-4" />,
  };
}

// Slash-menu item for inserting an initials field
function getInitialsSlashItem(editor: typeof schema.BlockNoteEditor) {
  return {
    title: "Initials Field",
    subtext: "Place where a party initials (for Send for signature)",
    onItemClick: () => {
      editor.insertBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ type: "initialsField", props: { signer: "client" } } as any],
        editor.getTextCursorPosition().block,
        "after"
      );
    },
    aliases: ["initials", "initial"],
    group: "Layout",
    icon: <PenLine className="w-4 h-4" />,
  };
}

// Slash-menu item for inserting a multiple-choice (radio) field
function getRadioSlashItem(editor: typeof schema.BlockNoteEditor) {
  return {
    title: "Multiple Choice (Radio)",
    subtext: "A question the signer must pick one option for",
    onItemClick: () => {
      editor.insertBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ type: "radioField", props: { signer: "client" } } as any],
        editor.getTextCursorPosition().block,
        "after"
      );
    },
    aliases: ["radio", "choice", "multiple choice", "option", "select"],
    group: "Layout",
    icon: <CircleDot className="w-4 h-4" />,
  };
}

// ─── Custom URL scheme for Supabase Storage ───────────────────────────────────

const SCHEME = "sb-storage://";
function toStorageUrl(bucket: string, path: string) { return `${SCHEME}${bucket}/${path}`; }
function isStorageUrl(url: string) { return url.startsWith(SCHEME); }
function parseBucketPath(url: string) {
  const rest  = url.slice(SCHEME.length);
  const slash = rest.indexOf("/");
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

// ─── Variable definitions ─────────────────────────────────────────────────────

interface FieldVariable {
  label: string;
  token: string;   // what gets inserted into the document
}

const CLIENT_VARS: FieldVariable[] = [
  { label: "Company Name",     token: "{{client.company_name}}"          },
  { label: "Contact Name",     token: "{{client.contact_name}}"          },
  { label: "Email",            token: "{{client.email}}"                 },
  { label: "Phone",            token: "{{client.phone}}"                 },
  { label: "2nd Contact Name", token: "{{client.secondary_contact_name}}" },
  { label: "2nd Contact Email",token: "{{client.secondary_email}}"        },
  { label: "2nd Contact Phone",token: "{{client.secondary_phone}}"        },
  { label: "Address",          token: "{{client.address}}"               },
  { label: "Logo",             token: "{{client.logo}}"                  },
];

const TENANT_VARS: FieldVariable[] = [
  { label: "Company Name",  token: "{{tenant.company_name}}"  },
  { label: "Contact Name",  token: "{{tenant.contact_name}}"  },
  { label: "Email",         token: "{{tenant.email}}"         },
  { label: "Phone",         token: "{{tenant.phone}}"         },
  { label: "Address",       token: "{{tenant.address}}"       },
  { label: "Logo",          token: "{{tenant.logo}}"          },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientData {
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  secondary_contact_name?: string | null;
  secondary_contact_email?: string | null;
  secondary_contact_phone?: string | null;
  address: string | null;
  address_street?: string | null;
  address_suite?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal?: string | null;
  address_country?: string | null;
}

interface TenantData {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface Props {
  /** The row id to save into — a quote id, or a template id when isTemplate. */
  quoteId: string;
  /** Template mode: persist to `templates.document_content`; hides quote-only actions. */
  isTemplate?: boolean;
  /** Read-only viewer mode: no toolbar, no editing, no auto-save. */
  readOnly?: boolean;
  /** Show the "Extract pricing" action (tenant owner only — it can create catalog products). */
  canExtractPricing?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialContent: any[] | null;
  clientData: ClientData | null;
  tenantData: TenantData | null;
  /** Live scenario data for the inline pricing-table block previews. */
  scenarios: EditorScenario[];
  taxRate: number;
  /** Show internal profit-margin column in the inline pricing-table previews. */
  showMargins: boolean;
  /** Tenant brand font ('sans'|'serif'|'mono') — applied to the editor canvas so
   *  editing is WYSIWYG with the proposal PDF. */
  docFont?: string | null;
  /** Called once on mount with an API the parent can invoke (save flush + checks). */
  onReady?: (api: ProposalEditorApi) => void;
  /** Called after pricing tables are extracted into scenarios (so the parent can refresh). */
  onPricingApplied?: () => void;
  /** Fires whenever the set of signature fields in the live document changes
   *  (array of "client"/"tenant" per placed field). Drives the Send button. */
  onSignatureFieldsChange?: (signers: string[]) => void;
}

export interface ProposalEditorApi {
  /** Flush any pending document save immediately. */
  saveNow: () => Promise<void>;
  /** True if the live document contains at least one pricing/scenario table. */
  hasPricingTable: () => boolean;
  /** scenarioRef values of every pricing table in the live document
   *  (e.g. "recommended", "all", or a specific scenario id). */
  documentScenarioRefs: () => string[];
  /** True if the live document has at least one signature field. */
  hasSignatureField: () => boolean;
}

type TextAlignment = "left" | "center" | "right";

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalEditor({ quoteId, isTemplate, readOnly, canExtractPricing, initialContent, clientData, tenantData, scenarios, taxRate, showMargins, docFont, onReady, onPricingApplied, onSignatureFieldsChange }: Props) {
  const supabaseRef = useRef(createClient());
  const isTemplateRef = useRef(isTemplate);
  isTemplateRef.current = isTemplate;
  const tenantId = useTenantId();
  const quoteIdRef  = useRef(quoteId);
  const toast       = useToast();
  const toastRef    = useRef(toast);
  toastRef.current  = toast;

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty    = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // Follow the app's dark mode (the editing canvas; PDF/Preview output is
  // always light, handled separately by the serializer).
  const { resolvedTheme } = useTheme();

  // ── uploadFile ──────────────────────────────────────────────────────────
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    const supabase = supabaseRef.current;
    const ext  = file.name.split(".").pop() ?? "bin";
    const path = `${quoteIdRef.current}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from("proposal-assets")
      .upload(path, file, { upsert: false, contentType: file.type });

    if (error) {
      toastRef.current.error(`Image upload failed: ${error.message}`);
      throw error;
    }
    toastRef.current.success("Image uploaded");
    return toStorageUrl("proposal-assets", path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── resolveFileUrl ──────────────────────────────────────────────────────
  const resolveFileUrl = useCallback(async (url: string): Promise<string> => {
    if (!isStorageUrl(url)) return url;
    const { bucket, path } = parseBucketPath(url);
    const { data, error } = await supabaseRef.current.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Editor ──────────────────────────────────────────────────────────────
  // IMPORTANT: do NOT pass saved content via `initialContent`. Custom blocks
  // (e.g. the pageBreak `content:"none"` block) crash with "Position undefined
  // out of range" when BlockNote renders their node view during the initial
  // mount — the ProseMirror view doesn't exist yet, so getPos() is undefined.
  // Instead we create the editor empty and load the content with replaceBlocks
  // in a post-mount effect, by which point the view (and getPos) is valid.
  const editor = useCreateBlockNote({
    schema,
    uploadFile,
    resolveFileUrl,
    // Multi-column: horizontal drop cursor + column-block translations.
    dropCursor: multiColumnDropCursor,
    dictionary: { ...enLocale, multi_column: multiColumnLocales.en },
  });

  // Keep a ref to the editor so save() always reads the latest document
  // without needing the editor in its useCallback deps (which would cause
  // the save/scheduleSave chain to rebuild unnecessarily).
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Load saved content once, after the editor view has mounted.
  // We defer with requestAnimationFrame so BlockNote's ProseMirror view is
  // fully attached to the DOM before replaceBlocks runs — otherwise the custom
  // node views either crash (getPos undefined) or the change doesn't render.
  const contentLoaded = useRef(false);
  const skipNextChange = useRef(false);
  useEffect(() => {
    if (contentLoaded.current) return;
    if (!initialContent || initialContent.length === 0) { contentLoaded.current = true; return; }

    const raf = requestAnimationFrame(() => {
      // Set the guard only AFTER the content actually loads. Under React
      // StrictMode (dev), effects run mount→cleanup→mount; the cleanup cancels
      // this rAF, so the guard must still be unset on the second run or the
      // content never loads (left the editor blank in dev). Re-checked here so
      // a stray double-fire still loads only once.
      if (contentLoaded.current) return;
      contentLoaded.current = true;
      try {
        // Self-heal any previously-saved malformed table block (would otherwise
        // crash BlockNote's table mouse handler on hover — see sanitizeBlocks).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleaned = sanitizeBlocks(initialContent as any[]);
        editor.replaceBlocks(editor.document, cleaned as any);
        // If nothing was dropped, ignore the echo onChange so we don't re-save
        // identical content; if we DID clean a block, let it persist.
        skipNextChange.current = cleaned.length === (initialContent as unknown[]).length;
      } catch (e) {
        console.error("[ProposalEditor] failed to load saved content:", e);
      }
    });
    return () => cancelAnimationFrame(raf);
  // initialContent is the server snapshot; we intentionally load it only once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // ── Auto-save ───────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const blocks = editorRef.current.document;
    if (!blocks || blocks.length === 0) return;

    setSaveState("saving");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseRef.current as any)
      .from(isTemplateRef.current ? "templates" : "quotes")
      .update({ document_content: blocks })
      .eq("id", quoteIdRef.current)
      .select("id");

    if (error) {
      console.error("[ProposalEditor] save error:", error);
      toastRef.current.error(`Failed to save document: ${error.message}`);
      setSaveState("idle");
    } else if (!data || data.length === 0) {
      console.warn("[ProposalEditor] save: 0 rows updated — RLS or wrong id");
      toastRef.current.error("Document not saved — permission issue. Try refreshing.");
      setSaveState("idle");
    } else {
      setSaveState("saved");
      // Reset "Saved" label back to idle after 2 s
      setTimeout(() => setSaveState("idle"), 2000);
    }
    isDirty.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleSave = useCallback(() => {
    isDirty.current = true;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1500);
  }, [save]);

  // Hand the parent a stable API (save flush + document checks) without needing
  // forwardRef (which conflicts with Next.js dynamic() imports and triggers
  // extra render cycles).
  useEffect(() => {
    onReady?.({
      saveNow: save,
      hasPricingTable: () => flattenBlocks(editorRef.current.document).some(b => b.type === "scenarioTable"),
      documentScenarioRefs: () =>
        flattenBlocks(editorRef.current.document)
          .filter(b => b.type === "scenarioTable")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(b => String((b.props as any)?.scenarioRef ?? "recommended")),
      hasSignatureField: () => flattenBlocks(editorRef.current.document).some(b => b.type === "signatureField"),
    });
  // save is stable; onReady is memoised by the parent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  // Notify the parent when the set of signature fields changes (drives the
  // "Send for signature" button). Deduped via a key so we only fire on change;
  // the initial empty-editor state ("") is the baseline, so the programmatic
  // content load fires the first real notification.
  const onSigChangeRef = useRef(onSignatureFieldsChange);
  onSigChangeRef.current = onSignatureFieldsChange;
  const lastSigKeyRef = useRef("");
  const notifySignatureFields = useCallback(() => {
    if (!onSigChangeRef.current) return;
    const kinds = flattenBlocks(editorRef.current.document)
      .filter(b => b.type === "signatureField" || b.type === "initialsField")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(b => String((b.props as any)?.signer ?? "client"));
    const key = kinds.join(",");
    if (key !== lastSigKeyRef.current) {
      lastSigKeyRef.current = key;
      onSigChangeRef.current(kinds);
    }
  }, []);

  // Subscribe directly to editor.onChange — bypasses BlockNoteView's prop
  // wiring (which can lose the subscription across re-renders) and fires for
  // every TipTap transaction including programmatic ones.
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  useEffect(() => {
    return editor.onChange(() => {
      notifySignatureFields();
      if (skipNextChange.current) { skipNextChange.current = false; return; }
      if (readOnlyRef.current) return; // viewer mode: never persist
      scheduleSave();
    });
  }, [editor, scheduleSave, notifySignatureFields]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (isDirty.current) save();
    };
  }, [save]);

  // Best-effort flush + warning if the tab is closed/refreshed mid-edit (within
  // the debounce window). The async save can't be guaranteed to finish, so we
  // also prompt the browser's native "unsaved changes" dialog to buy time.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty.current) return;
      save();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [save]);

  // ── Variable insertion ──────────────────────────────────────────────────
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);

  const insertVariable = useCallback((token: string) => {
    const ed = editorRef.current;
    try {
      ed.insertInlineContent([
        { type: "text", text: token, styles: { backgroundColor: "blue", textColor: "white" } },
        { type: "text", text: " ", styles: {} },
      ]);
    } catch {
      // fallback: insert at current cursor via focus
      ed.focus();
    }
    setFieldMenuOpen(false);
    scheduleSave();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSave]);

  // ── AI writing assistant ──────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [toneOpen, setToneOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  // A proposed AI edit awaiting the user's accept/discard decision.
  const [aiSuggestion, setAiSuggestion] = useState<{
    mode: string;
    original: string;   // selected text being edited ("" for generate/continue)
    suggested: string;
    from: number;
    to: number;
  } | null>(null);

  const SELECTION_MODES = ["improve", "expand", "shorten", "grammar", "tone"] as const;
  const MODE_LABELS: Record<string, string> = {
    improve: "Improve writing", expand: "Make longer", shorten: "Make shorter",
    grammar: "Fix spelling & grammar", tone: "Change tone",
    generate: "Generate", continue: "Continue writing",
  };

  // Build explicit ProseMirror paragraph nodes (NOT an HTML string). Inserting
  // HTML mid-paragraph made TipTap wrap the content in a blockquote; paragraph
  // nodes insert as clean, normal paragraphs.
  // Split AI output into clean paragraph strings (blank line = new paragraph;
  // single newlines collapse to spaces).
  function splitAiParas(t: string): string[] {
    return t.split(/\n{2,}/).map(s => s.trim().replace(/\s*\n\s*/g, " ")).filter(Boolean);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function tt() { return (editorRef.current as any)._tiptapEditor; }
  function getSelectedText(): string {
    const e = tt();
    const { from, to } = e.state.selection;
    return e.state.doc.textBetween(from, to, "\n").trim();
  }
  function getDocText(): string {
    const e = tt();
    return e.state.doc.textBetween(0, e.state.doc.content.size, "\n");
  }

  async function runAI(mode: string, opts?: { tone?: string; prompt?: string }) {
    const isSelection = (SELECTION_MODES as readonly string[]).includes(mode);
    const selected = isSelection ? getSelectedText() : "";
    if (isSelection && !selected) {
      toastRef.current.error("Select some text first");
      return;
    }
    // Capture the target range NOW so we can apply later even after focus moves
    // to the preview dialog. Selection modes replace [from,to]; generate/continue
    // insert at the cursor (from === to).
    const { from, to } = tt().state.selection;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: quoteIdRef.current,
          mode,
          text: selected || undefined,
          prompt: opts?.prompt,
          tone: opts?.tone,
          documentText: getDocText(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      // Stage the suggestion for review instead of applying immediately.
      setAiSuggestion({ mode, original: selected, suggested: data.text, from, to });
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setAiBusy(false);
      setAiOpen(false);
      setToneOpen(false);
      setAiPrompt("");
    }
  }

  function acceptSuggestion() {
    if (!aiSuggestion) return;
    const { from, to, suggested } = aiSuggestion;
    const ed = editorRef.current;
    const paras = splitAiParas(suggested);
    if (paras.length === 0) { setAiSuggestion(null); return; }

    // First paragraph replaces the selected range INLINE (so phrase-level edits
    // stay in place). Insert a text node, not a string, to avoid HTML parsing.
    tt().chain().focus().insertContentAt({ from, to }, [{ type: "text", text: paras[0] }]).run();

    // Remaining paragraphs become proper SIBLING blocks after the current block,
    // via BlockNote's insertBlocks. Inserting raw paragraph nodes through
    // ProseMirror nested each one as a child of the previous (the staircase bug).
    if (paras.length > 1) {
      const cur = ed.getTextCursorPosition().block;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ed.insertBlocks(paras.slice(1).map(p => ({ type: "paragraph", content: p })) as any, cur, "after");
    }

    scheduleSave();
    setAiSuggestion(null);
    toastRef.current.success("Applied — use Undo to revert");
  }

  function discardSuggestion() {
    setAiSuggestion(null);
  }

  // ── Draft a section with Claude (Insert-section menu) ─────────────────────
  // Calls /api/ai/draft for ONE grounded section, then stages the Markdown for
  // review (preview-before-apply) before converting to blocks + inserting.
  const PROPOSAL_SECTIONS = [
    "Executive Summary", "Scope of Work", "Why Us",
    "Timeline", "Investment", "Next Steps",
  ] as const;
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftBusy, setDraftBusy] = useState<string | null>(null); // section name while generating
  const [sectionDraft, setSectionDraft] = useState<{ section: string; markdown: string } | null>(null);
  const [customSection, setCustomSection] = useState("");

  // Length for ALL AI Draft paths (the full-proposal flow + single/custom section) —
  // the single Length control lives in the AI Draft menu. Persisted so the choice
  // sticks across drafts/sessions; default stays terse ("short").
  const [quickLength, setQuickLength] = useState<"short" | "standard" | "detailed">("short");
  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("quote.aiDraftLength") : null;
    if (v === "short" || v === "standard" || v === "detailed") setQuickLength(v);
  }, []);
  const chooseLength = (v: "short" | "standard" | "detailed") => {
    setQuickLength(v);
    try { localStorage.setItem("quote.aiDraftLength", v); } catch { /* ignore */ }
  };

  function runCustomSection() {
    const s = customSection.trim();
    if (!s) return;
    setCustomSection("");
    runSectionDraft(s);
  }

  // Signing/terms blocks already in the doc → drive the closing CTA (e-sign +
  // accept terms when radio/acceptance blocks exist).
  function docSigning() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = flattenBlocks(editorRef.current.document) as any[];
    return {
      hasTerms:     blocks.some(b => b.type === "radioField" || b.type === "acceptanceField"),
      hasSignature: blocks.some(b => b.type === "signatureField" || b.type === "initialsField"),
    };
  }

  // One POST to /api/ai/draft → cleaned Markdown. Robustly handles a NON-JSON
  // response (e.g. a Netlify gateway/timeout HTML page) so the user gets a useful
  // message instead of "Unexpected token '<'".
  async function fetchSectionDraft(body: Record<string, unknown>): Promise<string> {
    const res = await fetch("/api/ai/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId: quoteIdRef.current, ...body }),
    });
    const raw = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try { data = JSON.parse(raw); }
    catch {
      throw new Error(
        res.status === 504 || res.status === 502 || /tim(e|ed)\s?out|gateway/i.test(raw)
          ? "The AI took too long and timed out. Try a shorter Length, or draft one section at a time."
          : "The AI service returned an unexpected response. Please try again."
      );
    }
    if (!res.ok) throw new Error(data.error || "AI request failed");
    // Strip Markdown tables + demote H1→H2 (H1 is the doc title); preview === insert.
    return stripMarkdownTables(String(data.markdown ?? "")).replace(/^# /gm, "## ");
  }

  // Draft a SINGLE section (Insert-section menu / custom section).
  async function requestDraft(
    payload: { section?: string; referenceQuoteIds?: string[] },
    busyLabel: string,
    resultLabel: string,
    intake: { tone?: string; length?: string; emphasis?: string } = { tone: "professional", length: "short" }
  ) {
    setDraftBusy(busyLabel);
    setDraftOpen(false);
    try {
      const md = await fetchSectionDraft({ ...payload, intake, signing: docSigning() });
      if (!md) { toastRef.current.error("The AI returned an empty draft. Please try again."); return; }
      setSectionDraft({ section: resultLabel, markdown: md });
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setDraftBusy(null);
    }
  }

  // Draft a MULTI-section proposal ONE SECTION AT A TIME. A single all-sections
  // call (maxTokens 8192, Claude Opus) overran Netlify's function timeout → HTML
  // error page → "Unexpected token '<'". Per-section calls each stay well under
  // the limit; sections are assembled in order and the LAST gets the e-sign CTA.
  async function requestMultiDraft(
    sections: string[],
    intake: { tone?: string; length?: string; emphasis?: string },
    referenceQuoteIds?: string[]
  ) {
    const list = sections.map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    setDraftOpen(false);
    const signing = docSigning();
    const parts: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        setDraftBusy(`${i + 1}/${list.length}`);
        const md = await fetchSectionDraft({
          section: list[i],
          intake,
          signing,
          referenceQuoteIds,
          forceClosingCta: i === list.length - 1,
        });
        if (md) parts.push(md);
      }
      const combined = parts.join("\n\n");
      if (!combined) { toastRef.current.error("The AI returned an empty draft. Please try again."); return; }
      setSectionDraft({ section: "Full proposal", markdown: combined });
    } catch (e) {
      // A mid-way failure (e.g. timeout) still shows what completed, so it's not a total loss.
      if (parts.length) {
        setSectionDraft({ section: `Full proposal (first ${parts.length} of ${list.length})`, markdown: parts.join("\n\n") });
        toastRef.current.warning(`${(e as Error).message} — showing the ${parts.length} section(s) drafted so far.`);
      } else {
        toastRef.current.error((e as Error).message);
      }
    } finally {
      setDraftBusy(null);
    }
  }

  function runSectionDraft(section: string) {
    requestDraft({ section }, section, section, { tone: "professional", length: quickLength });
  }

  // ── Draft proposal: Intake → Outline → Draft ──────────────────────────────
  const [guidedStep, setGuidedStep] = useState<null | "intake" | "outline">(null);
  const [intakeTone, setIntakeTone] = useState("professional");
  const [intakeEmphasis, setIntakeEmphasis] = useState("");
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outline, setOutline] = useState<{ title: string; hint?: string }[]>([]);

  // Optional style exemplars: pick up to 2 past proposals (tenant-scoped by RLS).
  const [refQuotes, setRefQuotes] = useState<{ id: string; quote_number: string; title: string | null; client: string | null }[]>([]);
  const [refSelected, setRefSelected] = useState<string[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  useEffect(() => {
    if (guidedStep !== "intake") return;
    let cancelled = false;
    setRefLoading(true);
    (async () => {
      const { data } = await supabaseRef.current
        .from("quotes")
        .select("id, quote_number, title, client:clients(company_name)")
        .neq("id", quoteIdRef.current)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRefQuotes((data ?? []).map((q: any) => ({
        id: q.id, quote_number: q.quote_number, title: q.title, client: q.client?.company_name ?? null,
      })));
      setRefLoading(false);
    })();
    return () => { cancelled = true; };
  }, [guidedStep]);

  const currentIntake = () => ({
    tone: intakeTone,
    length: quickLength, // single Length control lives in the AI Draft menu
    emphasis: intakeEmphasis.trim() || undefined,
  });

  async function generateOutline() {
    setOutlineBusy(true);
    try {
      const res = await fetch("/api/ai/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quoteIdRef.current, intake: currentIntake() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");
      setOutline(Array.isArray(data.sections) ? data.sections : []);
      setGuidedStep("outline");
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setOutlineBusy(false);
    }
  }

  function moveOutline(i: number, dir: -1 | 1) {
    setOutline(o => {
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  function runGuidedDraft() {
    const titles = outline.map(s => s.title.trim()).filter(Boolean);
    if (titles.length === 0) { toastRef.current.error("Add at least one section"); return; }
    setGuidedStep(null);
    requestMultiDraft(titles, currentIntake(), refSelected.length ? refSelected : undefined);
  }

  async function acceptSectionDraft() {
    if (!sectionDraft) return;
    try {
      const blocks = await editorRef.current.tryParseMarkdownToBlocks(sectionDraft.markdown);
      if (!blocks || blocks.length === 0) { toastRef.current.error("Nothing to insert"); return; }
      insertBlocksIntoDoc(blocks);
      toastRef.current.success("Section inserted — use Undo if needed");
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setSectionDraft(null);
    }
  }

  // Drop malformed table blocks before inserting. BlockNote 0.14's markdown
  // parser (tryParseMarkdownToBlocks, used by AI Draft + .md Import) can emit a
  // `table` block whose content has no valid `rows` array; the table extension's
  // mouse handler then crashes reading `content.rows` of undefined. Keep
  // well-formed tables, drop empty/malformed ones; recurse children.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sanitizeBlocks(blocks: any[]): any[] {
    if (!Array.isArray(blocks)) return [];
    return blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => {
        if (b?.type === "table") {
          const rows = b?.content?.rows;
          return Array.isArray(rows) && rows.length > 0;
        }
        return true;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) =>
        Array.isArray(b?.children) && b.children.length
          ? { ...b, children: sanitizeBlocks(b.children) }
          : b
      );
  }

  // Fill an empty document, otherwise insert after the cursor. Shared by Import,
  // Apply-template, and AI Draft.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function insertBlocksIntoDoc(blocks: any[]) {
    const ed = editorRef.current;
    const safe = sanitizeBlocks(blocks);
    if (safe.length === 0) { toastRef.current.error("Nothing to insert"); return; }
    const doc = ed.document;
    const docEmpty =
      doc.length === 1 && doc[0].type === "paragraph" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (!doc[0].content || (Array.isArray(doc[0].content) && (doc[0].content as any).length === 0));
    if (docEmpty) ed.replaceBlocks(ed.document, safe);
    else ed.insertBlocks(safe, ed.getTextCursorPosition().block, "after");
    scheduleSave();
  }

  // ── Import .docx / .md ────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    const name = file.name.toLowerCase();
    const isMd = name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt");
    const isHtml = name.endsWith(".html") || name.endsWith(".htm");
    const isDocx = name.endsWith(".docx");
    if (!isMd && !isHtml && !isDocx) {
      toastRef.current.error("Please choose a .docx, .html, or .md file");
      return;
    }
    setImporting(true);
    try {
      const ed = editorRef.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let blocks: any[];
      if (isMd) {
        const text = await file.text();
        blocks = await ed.tryParseMarkdownToBlocks(text);
      } else if (isHtml) {
        // Read the HTML directly and use our own converter (handles tables).
        const text = await file.text();
        blocks = htmlToBlocks(text);
      } else {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/documents/parse-docx", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to read .docx");
        // Use our own HTML→blocks converter (handles tables correctly, unlike
        // BlockNote 0.14's tryParseHTMLToBlocks).
        blocks = htmlToBlocks(data.html);
      }
      if (!blocks || blocks.length === 0) {
        toastRef.current.error("Nothing to import — the file appears empty");
        return;
      }
      insertBlocksIntoDoc(blocks);
      toastRef.current.success("Document imported — use Undo if needed");
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  // ── Save current document as a template ─────────────────────────────────────
  // (Applying templates happens at quote creation — New Quote modal "Start
  // from", or /templates → "New quote" — not mid-document.)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [tplOpen, setTplOpen] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [tplName, setTplName] = useState("");

  async function saveAsTemplate() {
    const name = tplName.trim();
    if (!name) { toastRef.current.error("Name the template first"); return; }
    if (!tenantId) { toastRef.current.error("Still loading — try again in a moment"); return; }
    setTplBusy(true);
    try {
      const blocks = editorRef.current.document;
      const { data: { user } } = await supabaseRef.current.auth.getUser();
      const { error } = await (supabaseRef.current as any).from("templates").insert({
        tenant_id: tenantId, created_by: user?.id, name, document_content: blocks,
        source_file_type: "native", is_active: true,
      });
      if (error) throw new Error(error.message);
      toastRef.current.success(`Saved template “${name}” — find it on the Templates page`);
      setTplName("");
      setTplOpen(false);
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setTplBusy(false);
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Extract pricing tables → scenarios ────────────────────────────────────
  /* eslint-disable @typescript-eslint/no-explicit-any */
  interface PItem {
    description: string; billing_period: "Monthly" | "One Time"; quantity: number;
    unit_price: number; is_taxable: boolean;
    match: { productId: string; name: string; tierId: string | null; unitPrice: number | null; unitCost: number | null } | null;
    action: "link" | "create" | "freetext";
  }
  interface PScenario { name: string; include: boolean; lineItems: PItem[] }

  const [extractBusy, setExtractBusy] = useState(false);
  const [pricing, setPricing] = useState<PScenario[] | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [confirmCatalog, setConfirmCatalog] = useState(false);

  // Count of distinct NEW products that would be added to the catalog.
  function newProductCount(): number {
    if (!pricing) return 0;
    const names = new Set<string>();
    for (const s of pricing) if (s.include)
      for (const it of s.lineItems)
        if (it.action === "create") names.add(it.description.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
    return names.size;
  }

  function blockText(b: any): string {
    return Array.isArray(b?.content) ? b.content.map((n: any) => n?.text ?? "").join("") : "";
  }
  function gatherTables() {
    const tables: { heading: string; rows: string[][] }[] = [];
    // Walk recursively: tables can be NESTED inside a block's children (e.g. a
    // table under a descriptive paragraph), which the old top-level-only scan missed.
    const walk = (blocks: any[], heading: string) => {
      for (const b of blocks) {
        if (b.type === "heading") heading = blockText(b);
        if (b.type === "table") {
          const rows = (((b.content as any)?.rows) ?? []).map((r: any) =>
            (r.cells ?? []).map((cell: any) => {
              // 0.51 cell = { type:"tableCell", content:[...] }; 0.14 = InlineContent[].
              const inline = Array.isArray(cell) ? cell : (cell?.content ?? []);
              return inline.map((n: any) => n?.text ?? "").join("");
            }));
          tables.push({ heading, rows });
        }
        if (Array.isArray(b.children) && b.children.length) {
          // A non-table parent's text becomes the heading hint for its nested tables.
          const childHeading = b.type !== "table" && blockText(b) ? blockText(b) : heading;
          walk(b.children, childHeading);
        }
      }
    };
    walk(editorRef.current.document, "");
    return tables;
  }

  async function extractPricing() {
    const tables = gatherTables();
    if (tables.length === 0) {
      toastRef.current.error("No tables found in the document to extract from");
      return;
    }
    setExtractBusy(true);
    try {
      const res = await fetch("/api/ai/extract-pricing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      if (!data.scenarios?.length) {
        toastRef.current.error("No pricing tables detected in the document");
        return;
      }
      setPricing(data.scenarios.map((s: any) => ({
        name: s.name,
        include: true,
        lineItems: (s.lineItems ?? []).map((it: any) => ({
          ...it,
          action: it.match ? "link" : "create",
        })),
      })));
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setExtractBusy(false);
    }
  }

  async function applyPricing() {
    if (!pricing) return;
    const scenarios = pricing.filter(s => s.include).map(s => ({
      name: s.name,
      lineItems: s.lineItems.map(it => ({
        description: it.description, billing_period: it.billing_period, quantity: it.quantity,
        unit_price: it.unit_price, is_taxable: it.is_taxable, action: it.action,
        productId: it.action === "link" ? it.match?.productId : undefined,
        tierId:    it.action === "link" ? it.match?.tierId : undefined,
        unitCost:  it.action === "link" ? it.match?.unitCost : undefined,
      })),
    }));
    if (scenarios.length === 0) { toastRef.current.error("Select at least one scenario"); return; }
    setApplyBusy(true);
    try {
      const res = await fetch(`/api/quotes/${quoteIdRef.current}/apply-pricing`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarios }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create scenarios");
      const n = (data.created ?? []).length;
      const added = data.productsCreated ?? 0;
      toastRef.current.success(
        `Created ${n} scenario${n === 1 ? "" : "s"}` +
        (added > 0 ? ` · added ${added} new product${added === 1 ? "" : "s"} to your catalog` : "")
      );
      setPricing(null);
      setConfirmCatalog(false);
      onPricingApplied?.();
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setApplyBusy(false);
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Alignment ───────────────────────────────────────────────────────────
  function applyAlignment(alignment: TextAlignment) {
    const selectedBlocks = editor.getSelection()?.blocks ?? [
      editor.getTextCursorPosition().block,
    ];
    for (const block of selectedBlocks) {
      if ("textAlignment" in block.props) {
        editor.updateBlock(block, {
          props: { textAlignment: alignment } as Record<string, string>,
        });
      }
    }
    editor.focus();
    scheduleSave();
  }

  function currentAlignment(): TextAlignment | null {
    try {
      const block = editor.getTextCursorPosition().block;
      if ("textAlignment" in block.props) return block.props.textAlignment as TextAlignment;
    } catch { /* not ready */ }
    return null;
  }

  // Wrap the selected block(s) into a two-column layout, splitting them across
  // the two columns (left gets the extra when odd; a single block goes left with
  // an empty right column to fill). Avoids the cumbersome drag-to-side gesture.
  function makeTwoColumns() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks: any[] = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    if (blocks.length === 0) return;
    if (blocks.some((b) => b.type === "columnList" || b.type === "column")) {
      toastRef.current.error("That selection already includes columns — pick plain blocks to split into two columns.");
      return;
    }
    // Drop ids so the re-inserted children don't collide with the removed originals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toPartial = (b: any): any => ({ type: b.type, props: b.props, content: b.content, children: (b.children ?? []).map(toPartial) });
    const mid = Math.ceil(blocks.length / 2);
    const left = blocks.slice(0, mid).map(toPartial);
    const right = blocks.slice(mid).map(toPartial);
    if (right.length === 0) right.push({ type: "paragraph" });
    const columnList = {
      type: "columnList",
      children: [
        { type: "column", props: { width: 1 }, children: left },
        { type: "column", props: { width: 1 }, children: right },
      ],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.replaceBlocks(blocks, [columnList as any]);
    editor.focus();
    scheduleSave();
  }

  // ── Editor hints bar (dismissible, persisted; platform-aware modifier) ────
  const [showHints, setShowHints] = useState(true);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setShowHints(localStorage.getItem("quote.editorHints") !== "hidden");
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  function toggleHints() {
    setShowHints((v) => {
      const next = !v;
      localStorage.setItem("quote.editorHints", next ? "shown" : "hidden");
      return next;
    });
  }
  const mod = isMac ? "⌘" : "Ctrl";

  // ── Render ──────────────────────────────────────────────────────────────

  const alignButtons: { alignment: TextAlignment; icon: React.ReactNode; label: string }[] = [
    { alignment: "left",   icon: <AlignLeft   className="w-3.5 h-3.5" />, label: "Align left"   },
    { alignment: "center", icon: <AlignCenter className="w-3.5 h-3.5" />, label: "Align center" },
    { alignment: "right",  icon: <AlignRight  className="w-3.5 h-3.5" />, label: "Align right"  },
  ];

  const active = currentAlignment();

  // Resolve display value for a variable token (shows actual data if available)
  function tokenPreview(token: string): string {
    // Logo tokens render as an image at PDF/Preview time, not text.
    if (token === "{{client.logo}}" || token === "{{tenant.logo}}") return "🖼 logo image";
    if (clientData) {
      if (token === "{{client.company_name}}")  return clientData.company_name   || token;
      if (token === "{{client.contact_name}}")  return clientData.contact_name   || token;
      if (token === "{{client.email}}")          return clientData.contact_email  || token;
      if (token === "{{client.phone}}")          return clientData.contact_phone  || token;
      if (token === "{{client.secondary_contact_name}}") return clientData.secondary_contact_name || token;
      if (token === "{{client.secondary_email}}")        return clientData.secondary_contact_email || token;
      if (token === "{{client.secondary_phone}}")        return clientData.secondary_contact_phone || token;
      if (token === "{{client.address}}")        return composeAddress(clientData) || token;
    }
    if (tenantData) {
      if (token === "{{tenant.company_name}}")  return tenantData.name           || token;
      if (token === "{{tenant.contact_name}}")  return tenantData.contact_name   || token;
      if (token === "{{tenant.email}}")          return tenantData.email          || token;
      if (token === "{{tenant.phone}}")          return tenantData.phone          || token;
      if (token === "{{tenant.address}}")        return tenantData.address        || token;
    }
    return token;
  }

  return (
    <div className="flex flex-col h-full">

      {/* Persistent toolbar (hidden entirely in read-only viewer mode) */}
      {!readOnly && (
      <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-muted/50 shrink-0">

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <button
            title="Undo (⌘Z)"
            onMouseDown={(e) => { e.preventDefault(); editorRef.current.undo(); scheduleSave(); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            title="Redo (⌘⇧Z)"
            onMouseDown={(e) => { e.preventDefault(); editorRef.current.redo(); scheduleSave(); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Alignment buttons */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          {alignButtons.map(({ alignment, icon, label }) => (
            <button
              key={alignment}
              title={label}
              onMouseDown={(e) => { e.preventDefault(); applyAlignment(alignment); }}
              className={cn(
                "p-1.5 rounded transition-colors",
                active === alignment
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {icon}
            </button>
          ))}
          <button
            title="Make 2 columns from the selected block(s)"
            onMouseDown={(e) => { e.preventDefault(); makeTwoColumns(); }}
            className="p-1.5 rounded transition-colors hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Insert Field dropdown */}
        <div className="relative border-r pr-2 mr-1">
          <button
            title="Insert a pricing table, signature, page break, or a client/company detail that fills in automatically"
            onMouseDown={(e) => { e.preventDefault(); setFieldMenuOpen(o => !o); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Insert <ChevronDown className="w-3 h-3" />
          </button>

          {fieldMenuOpen && (
            <>
              {/* Overlay to close on outside click */}
              <div
                className="fixed inset-0 z-10"
                onMouseDown={() => setFieldMenuOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-violet-200 bg-violet-50 shadow-xl overflow-hidden max-h-[70vh] overflow-y-auto">

                {/* ── Building blocks (no slash command needed) ── */}
                <div className="px-4 py-2 bg-violet-100 border-b border-violet-200">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Building blocks</p>
                </div>
                {[
                  { label: "Pricing table", desc: "Show a scenario's pricing", icon: <Table2 className="w-4 h-4" />,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    block: { type: "scenarioTable", props: { scenarioRef: "recommended" } } as any },
                  { label: "Signature", desc: "Where a party signs", icon: <PenLine className="w-4 h-4" />,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    block: { type: "signatureField", props: { signer: "client" } } as any },
                  { label: "Initials", desc: "Where a party initials", icon: <PenLine className="w-4 h-4" />,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    block: { type: "initialsField", props: { signer: "client" } } as any },
                  { label: "Multiple choice", desc: "Signer picks one option", icon: <CircleDot className="w-4 h-4" />,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    block: { type: "radioField", props: { signer: "client" } } as any },
                  { label: "Acceptance checkbox", desc: "Customer must check before signing", icon: <CheckSquare className="w-4 h-4" />,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    block: { type: "acceptanceField" } as any },
                  { label: "Page break", desc: "Start a new page in the PDF", icon: <Scissors className="w-4 h-4" />,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    block: { type: "pageBreak" } as any },
                ].map((b) => (
                  <button
                    key={b.label}
                    onMouseDown={(e) => { e.preventDefault(); insertBlocksIntoDoc([b.block]); setFieldMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-violet-100 transition-colors border-b border-violet-100 last:border-0 flex items-center gap-3"
                  >
                    <span className="text-violet-600 shrink-0">{b.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-800">{b.label}</span>
                      <span className="block text-xs text-gray-500 truncate">{b.desc}</span>
                    </span>
                  </button>
                ))}

                {/* ── Client fields ── */}
                <div className="px-4 py-2 bg-violet-100 border-b border-violet-200">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Client</p>
                </div>
                {CLIENT_VARS.map(({ label, token }) => {
                  const preview = tokenPreview(token);
                  const hasValue = preview !== token;
                  return (
                    <button
                      key={token}
                      onMouseDown={(e) => { e.preventDefault(); insertVariable(token); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-violet-100 transition-colors border-b border-violet-100 last:border-0"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{label}</span>
                        <span
                          className={cn(
                            "text-xs truncate text-right",
                            hasValue ? "text-violet-600" : "text-gray-400 font-mono"
                          )}
                          title={preview}
                        >
                          {hasValue ? preview : token}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* ── My Company fields ── */}
                <div className="px-4 py-2 bg-violet-100 border-y border-violet-200">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">My Company</p>
                </div>
                {TENANT_VARS.map(({ label, token }) => {
                  const preview = tokenPreview(token);
                  const hasValue = preview !== token;
                  return (
                    <button
                      key={token}
                      onMouseDown={(e) => { e.preventDefault(); insertVariable(token); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-violet-100 transition-colors border-b border-violet-100 last:border-0"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{label}</span>
                        <span
                          className={cn(
                            "text-xs truncate text-right",
                            hasValue ? "text-violet-600" : "text-gray-400 font-mono"
                          )}
                          title={preview}
                        >
                          {hasValue ? preview : token}
                        </span>
                      </div>
                    </button>
                  );
                })}

              </div>
            </>
          )}
        </div>

        {/* Flexible gap — separates editing tools (left) from feature actions (right) */}
        <div className="flex-1" />

        {/* ── Feature actions (right cluster) ── */}
        {/* Ask AI dropdown */}
        <div className="relative border-l pl-3">
          <button
            title="AI writing assistant — improve, expand, shorten, change tone, or generate proposal text"
            onMouseDown={(e) => { e.preventDefault(); if (!aiBusy) setAiOpen(o => !o); }}
            disabled={aiBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-60"
          >
            {aiBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {aiBusy ? "Thinking…" : "Ask AI"}
            {!aiBusy && <ChevronDown className="w-3 h-3" />}
          </button>

          {aiOpen && !aiBusy && (() => {
            const hasSel = getSelectedText().length > 0;
            const toneOptions = ["Professional", "Friendly", "Confident", "Concise", "Persuasive"];
            return (
              <>
                <div className="fixed inset-0 z-10" onMouseDown={() => { setAiOpen(false); setToneOpen(false); }} />
                <div className="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-violet-200 bg-white shadow-xl overflow-hidden">
                  <div className="px-4 py-2 bg-violet-100 border-b border-violet-200">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">
                      Edit selection {hasSel ? "" : "(select text first)"}
                    </p>
                  </div>
                  {[
                    { mode: "improve", label: "Improve writing" },
                    { mode: "expand",  label: "Make longer" },
                    { mode: "shorten", label: "Make shorter" },
                    { mode: "grammar", label: "Fix spelling & grammar" },
                  ].map(({ mode, label }) => (
                    <button
                      key={mode}
                      disabled={!hasSel}
                      onMouseDown={(e) => { e.preventDefault(); runAI(mode); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                    >
                      {label}
                    </button>
                  ))}

                  {/* Change tone (expands) */}
                  <button
                    disabled={!hasSel}
                    onMouseDown={(e) => { e.preventDefault(); setToneOpen(o => !o); }}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-800 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                  >
                    Change tone
                    <ChevronDown className={cn("w-3 h-3 transition-transform", toneOpen && "rotate-180")} />
                  </button>
                  {toneOpen && hasSel && (
                    <div className="bg-violet-50/60 border-y border-violet-100">
                      {toneOptions.map(t => (
                        <button
                          key={t}
                          onMouseDown={(e) => { e.preventDefault(); runAI("tone", { tone: t }); }}
                          className="w-full text-left pl-7 pr-4 py-1.5 text-sm text-gray-700 hover:bg-violet-100 transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="px-4 py-2 bg-violet-100 border-y border-violet-200">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Generate</p>
                  </div>
                  <div className="p-3 space-y-2">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="e.g. Write an executive summary…"
                      rows={2}
                      className="w-full text-sm rounded-md border border-violet-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                    />
                    <button
                      onMouseDown={(e) => { e.preventDefault(); if (aiPrompt.trim()) runAI("generate", { prompt: aiPrompt.trim() }); }}
                      disabled={!aiPrompt.trim()}
                      className="w-full rounded-md bg-violet-600 text-white text-sm font-medium py-1.5 hover:bg-violet-700 disabled:opacity-40 transition-colors"
                    >
                      Generate at cursor
                    </button>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); runAI("continue"); }}
                      className="w-full rounded-md border border-violet-200 text-violet-700 text-sm font-medium py-1.5 hover:bg-violet-50 transition-colors"
                    >
                      Continue writing
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Draft a section with AI (quote-only — needs the quote's scenarios/
            client data to ground the content). Hidden in template mode. */}
        {!isTemplate && (
        <div className="relative">
          <button
            title="AI Draft — generate a proposal section (Executive Summary, Scope, etc.) grounded in this quote's client, pricing, and client notes"
            onMouseDown={(e) => { e.preventDefault(); if (!draftBusy) setDraftOpen(o => !o); }}
            disabled={!!draftBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-60"
          >
            {draftBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {draftBusy ? (/^\d+\/\d+$/.test(draftBusy) ? `Drafting ${draftBusy}…` : "Drafting…") : "AI Draft"}
            {!draftBusy && <ChevronDown className="w-3 h-3" />}
          </button>

          {draftOpen && !draftBusy && (
            <>
              <div className="fixed inset-0 z-10" onMouseDown={() => setDraftOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-lg border border-violet-200 bg-white shadow-xl overflow-hidden">
                <div className="px-3 pt-2.5 pb-2 border-b border-violet-200">
                  <p className="text-[10px] font-semibold text-violet-700 uppercase tracking-widest mb-1.5">Length · all drafts</p>
                  <div className="flex gap-1">
                    {(["short", "standard", "detailed"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); chooseLength(v); }}
                        title={v === "short" ? "One terse paragraph per section" : v === "standard" ? "Two to three paragraphs per section" : "Thorough, detailed treatment"}
                        className={cn(
                          "flex-1 rounded px-1.5 py-1 text-[11px] font-medium capitalize transition-colors",
                          quickLength === v ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onMouseDown={(e) => { e.preventDefault(); setDraftOpen(false); setRefSelected([]); setGuidedStep("intake"); }}
                  className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm font-medium text-violet-800 bg-violet-50 hover:bg-violet-100 border-b border-violet-200 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  Draft full proposal
                  <span className="ml-auto text-[10px] font-normal text-violet-500">style → outline → draft</span>
                </button>
                <div className="px-4 py-2 bg-violet-100 border-b border-violet-200">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-widest">Or draft one section</p>
                </div>
                {PROPOSAL_SECTIONS.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); runSectionDraft(s); }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-violet-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
                {/* Custom section — draft any heading the presets don't cover. */}
                <div className="border-t border-violet-100 p-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={customSection}
                      onChange={(e) => setCustomSection(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runCustomSection(); } }}
                      placeholder="Custom section…"
                      maxLength={80}
                      className="flex-1 min-w-0 text-sm rounded-md border border-violet-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); runCustomSection(); }}
                      disabled={!customSection.trim()}
                      className="shrink-0 rounded-md bg-violet-600 text-white text-xs font-medium px-2.5 py-1.5 hover:bg-violet-700 disabled:opacity-40 transition-colors"
                    >
                      Draft
                    </button>
                  </div>
                </div>
                <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-violet-100">
                  Grounded in this quote’s client &amp; pricing. You review before it’s inserted.
                </p>
              </div>
            </>
          )}
        </div>
        )}

        {/* Import .docx / .html / .md */}
        <div>
          <button
            title="Import a .docx, .html, or .md file"
            onMouseDown={(e) => { e.preventDefault(); if (!importing) importInputRef.current?.click(); }}
            disabled={importing}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
            {importing ? "Importing…" : "Import"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".docx,.html,.htm,.md,.markdown,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
          />
        </div>

        {/* Save as template (not shown while editing a template itself).
            Applying templates happens at quote creation, not here. */}
        {!isTemplate && (
        <div className="relative">
          <button
            title="Save this document as a reusable template (new quotes can start from it)"
            onMouseDown={(e) => { e.preventDefault(); if (!tplBusy) setTplOpen(o => !o); }}
            disabled={tplBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
          >
            {tplBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookTemplate className="w-3.5 h-3.5" />}
            Save as template
          </button>

          {tplOpen && (
            <>
              <div className="fixed inset-0 z-10" onMouseDown={() => setTplOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border bg-white shadow-xl overflow-hidden">
                <div className="p-3 space-y-2">
                  <input
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="Template name…"
                    autoFocus
                    className="w-full text-sm rounded-md border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onMouseDown={(e) => { e.preventDefault(); if (tplName.trim()) saveAsTemplate(); }}
                    disabled={!tplName.trim() || tplBusy}
                    className="w-full rounded-md bg-primary text-primary-foreground text-sm font-medium py-1.5 hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    Save current document
                  </button>
                  <p className="text-[11px] text-muted-foreground">
                    New quotes can start from it (New Quote → “Start from”).
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        )}

        {/* Extract pricing tables → scenarios (quote-only, tenant owner only —
            applying can create catalog products) */}
        {!isTemplate && canExtractPricing && (
        <div>
          <button
            title="Detect pricing tables and turn them into scenarios"
            onMouseDown={(e) => { e.preventDefault(); if (!extractBusy) extractPricing(); }}
            disabled={extractBusy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-60"
          >
            {extractBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}
            {extractBusy ? "Scanning…" : "Extract pricing"}
          </button>
        </div>
        )}

        <button
          title={showHints ? "Hide editor tips" : "Show editor tips"}
          onMouseDown={(e) => { e.preventDefault(); toggleHints(); }}
          className={cn(
            "ml-2 p-1.5 rounded hover:bg-muted transition-colors",
            showHints ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        <span className={cn(
          "text-xs transition-colors duration-300 ml-3 border-l pl-3 min-w-[58px] text-right",
          saveState === "saving" ? "text-muted-foreground" :
          saveState === "saved"  ? "text-green-600" :
          "text-transparent"
        )}>
          {saveState === "saving" ? "Saving…" : "Saved ✓"}
        </span>
      </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        <div className="overflow-x-visible px-2 py-4" data-doc-font={docFont ?? "sans"}>
            <ScenarioContext.Provider value={{ scenarios, taxRate, showMargins }}>
              <BlockNoteView
                editor={editor}
                editable={!readOnly}
                theme={resolvedTheme === "dark" ? "dark" : "light"}
                slashMenu={false}
              >
                <SuggestionMenuController
                  triggerCharacter="/"
                  getItems={async (query) =>
                    filterSuggestionItems(
                      [
                        // Drop blocks we don't support in the proposal/PDF:
                        // Video/Audio/File never render in the PDF; Quote/Code
                        // Block/Check List are new in 0.51 and either confuse
                        // ("Quote" vs an SmartProps quote) or aren't wanted here.
                        ...getDefaultReactSlashMenuItems(editor).filter(
                          (item) => !["Video", "Audio", "File", "Quote", "Code Block", "Check List", "Toggle List"].includes((item as { title?: string }).title ?? "")
                        ),
                        getPageBreakSlashItem(editor),
                        getScenarioSlashItem(editor),
                        getSignatureSlashItem(editor),
                        getInitialsSlashItem(editor),
                        getRadioSlashItem(editor),
                        getAcceptanceSlashItem(editor),
                        // Two-column layout items (xl-multi-column).
                        ...getMultiColumnSlashMenuItems(editor),
                      ],
                      query
                    )
                  }
                />
              </BlockNoteView>
            </ScenarioContext.Provider>
          </div>
      </div>

      {/* Editor hints — block operations & shortcuts (dismissible). */}
      {!readOnly && showHints && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 border-t bg-muted/40 text-[11px] text-muted-foreground">
          <Keyboard className="w-3 h-3 shrink-0" />
          {[
            <><Kbd>/</Kbd> insert block</>,
            <>Select text, then <Kbd>{mod}</Kbd> <Kbd>B</Kbd>/<Kbd>I</Kbd>/<Kbd>U</Kbd> format</>,
            <><span className="font-bold">⠿</span> drag or <Kbd>{mod}</Kbd> <Kbd>⇧</Kbd> <Kbd>↑↓</Kbd> move</>,
            <>Click-drag across blocks to select several (then move together)</>,
            <><Kbd>Tab</Kbd> / <Kbd>⇧Tab</Kbd> nest / un-nest</>,
            <><Kbd>{mod}C</Kbd> / <Kbd>{mod}V</Kbd> copy-paste (also from Word/Docs)</>,
            <><Kbd>{mod}Z</Kbd> / <Kbd>{mod}⇧Z</Kbd> undo / redo</>,
          ].map((hint, i) => <span key={i} className="whitespace-nowrap">{hint}</span>)}
          <button
            title="Hide editor tips"
            onMouseDown={(e) => { e.preventDefault(); toggleHints(); }}
            className="ml-auto p-0.5 rounded hover:bg-muted-foreground/10 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* AI suggestion review */}
      {aiSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-2 px-5 py-3 border-b">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold">
                {MODE_LABELS[aiSuggestion.mode] ?? "AI suggestion"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {aiSuggestion.original && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Original</p>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap text-muted-foreground line-through decoration-red-300/70">
                    {aiSuggestion.original}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">
                  {aiSuggestion.original ? "Suggested replacement" : "Suggested text"}
                </p>
                <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 text-sm whitespace-pre-wrap">
                  {aiSuggestion.suggested}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              <button
                onClick={discardSuggestion}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" /> Discard
              </button>
              <button
                onClick={acceptSuggestion}
                className="flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                <Check className="w-4 h-4" />
                {aiSuggestion.original ? "Replace" : "Insert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drafted-section review (preview-before-apply) */}
      {sectionDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-2 px-5 py-3 border-b">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold">AI Draft: {sectionDraft.section}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">Suggested section</p>
              <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 text-sm whitespace-pre-wrap">
                {sectionDraft.markdown}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Markdown is converted to formatted blocks on insert. Bracketed
                <code className="mx-1 px-1 rounded bg-muted">[confirm: …]</code>notes mark details to fill in.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              <button
                onClick={() => setSectionDraft(null)}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" /> Discard
              </button>
              <button
                onClick={acceptSectionDraft}
                className="flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                <Check className="w-4 h-4" /> Insert section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft proposal — Step 1: Intake */}
      {guidedStep === "intake" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-2xl w-full max-w-lg flex flex-col">
            <div className="flex items-center gap-2 px-5 py-3 border-b">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold">Draft proposal — Step 1: Style</span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                The AI already has the client, services, and your Client Notes. Set the style,
                and it&apos;ll propose a section outline you can edit before drafting.
              </p>
              <div className="space-y-1">
                <label className="text-sm font-medium">Tone</label>
                <select value={intakeTone} onChange={(e) => setIntakeTone(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="professional">Professional</option>
                  <option value="warm and consultative">Warm &amp; consultative</option>
                  <option value="confident">Confident</option>
                  <option value="concise">Concise</option>
                  <option value="persuasive">Persuasive</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Length is set in the AI Draft menu — currently <strong className="font-medium capitalize">{quickLength}</strong>.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Emphasis <span className="font-normal text-muted-foreground">(optional)</span></label>
                <textarea value={intakeEmphasis} onChange={(e) => setIntakeEmphasis(e.target.value)} rows={2} maxLength={300}
                  placeholder="Anything to stress — e.g. after-hours security, fast rollout, NDAA compliance, budget fit."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Reference a past proposal <span className="font-normal text-muted-foreground">(optional — style example)</span>
                </label>
                {refLoading ? (
                  <p className="text-xs text-muted-foreground">Loading your proposals…</p>
                ) : refQuotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No other proposals to reference yet.</p>
                ) : (
                  <div className="max-h-32 overflow-y-auto rounded-md border divide-y">
                    {refQuotes.map((q) => {
                      const checked = refSelected.includes(q.id);
                      const atMax = refSelected.length >= 2 && !checked;
                      return (
                        <label
                          key={q.id}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-muted/50",
                            atMax ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={atMax}
                            onChange={() => setRefSelected((sel) => checked ? sel.filter((x) => x !== q.id) : [...sel, q.id])}
                          />
                          <span className="truncate">
                            <span className="font-mono text-xs">{q.quote_number}</span>
                            {q.title ? ` · ${q.title}` : ""}
                            {q.client ? <span className="text-muted-foreground"> — {q.client}</span> : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Pick up to 2. The AI uses them as examples of writing style and structure only — never their facts or pricing.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              <button onClick={() => setGuidedStep(null)}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
              <button onClick={generateOutline} disabled={outlineBusy}
                className="flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {outlineBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Building outline…</> : <>Continue → Outline</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft proposal — Step 2: Outline */}
      {guidedStep === "outline" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-2 px-5 py-3 border-b">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <span className="text-sm font-semibold">Draft proposal — Step 2: Outline</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              <p className="text-sm text-muted-foreground">
                Edit the sections — rename, reorder, add, or remove — then draft them all.
                Each becomes a heading in the document.
              </p>
              {outline.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={s.title}
                    onChange={(e) => setOutline(o => o.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))}
                    placeholder="Section title"
                    title={s.hint}
                    className="flex-1 min-w-0 rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button onClick={() => moveOutline(i, -1)} disabled={i === 0} title="Move up"
                    className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"><ChevronDown className="w-4 h-4 rotate-180" /></button>
                  <button onClick={() => moveOutline(i, 1)} disabled={i === outline.length - 1} title="Move down"
                    className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  <button onClick={() => setOutline(o => o.filter((_, idx) => idx !== i))} title="Remove"
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={() => setOutline(o => [...o, { title: "" }])}
                className="text-sm font-medium text-violet-700 hover:text-violet-900">+ Add section</button>
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t">
              <button onClick={() => setGuidedStep("intake")}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">← Back</button>
              <button onClick={runGuidedDraft} disabled={outline.filter(s => s.title.trim()).length === 0}
                className="flex items-center gap-1.5 rounded-md bg-violet-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
                <Sparkles className="w-4 h-4" /> Draft {outline.filter(s => s.title.trim()).length} sections
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing extraction review */}
      {pricing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl border shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-2 px-5 py-3 border-b">
              <ListPlus className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold">Review extracted pricing</span>
              <span className="text-xs text-muted-foreground">— creates scenarios in this quote</span>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {pricing.map((s, si) => (
                <div key={si} className={cn("rounded-lg border", !s.include && "opacity-50")}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20">
                    <input
                      type="checkbox"
                      checked={s.include}
                      onChange={(e) => setPricing(p => p!.map((x, i) => i === si ? { ...x, include: e.target.checked } : x))}
                      className="rounded"
                    />
                    <input
                      value={s.name}
                      onChange={(e) => setPricing(p => p!.map((x, i) => i === si ? { ...x, name: e.target.value } : x))}
                      className="flex-1 bg-transparent border-none outline-none text-sm font-semibold"
                    />
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="text-left px-4 py-1.5 font-medium">Item</th>
                        <th className="text-left px-2 py-1.5 font-medium">Billing</th>
                        <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                        <th className="text-right px-2 py-1.5 font-medium">Unit</th>
                        <th className="text-left px-2 py-1.5 font-medium w-56">Catalog action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {s.lineItems.map((it, li) => (
                        <tr key={li}>
                          <td className="px-4 py-1.5">
                            {it.description}
                            {it.match && (
                              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 text-xs">
                                <AlertTriangle className="w-3 h-3" /> in catalog
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{it.billing_period}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{it.quantity}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                          <td className="px-2 py-1.5">
                            {it.match ? (
                              // Already in the catalog — nothing to create, so no choice needed.
                              <span className="text-xs text-muted-foreground">Uses catalog item</span>
                            ) : (
                              <select
                                value={it.action}
                                onChange={(e) => setPricing(p => p!.map((x, i) => i === si ? {
                                  ...x, lineItems: x.lineItems.map((y, j) => j === li ? { ...y, action: e.target.value as PItem["action"] } : y),
                                } : x))}
                                className="w-full rounded border bg-background px-1.5 py-1 text-xs"
                              >
                                <option value="create">Add to Professional Services</option>
                                <option value="freetext">Custom (no catalog)</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Items already in your catalog default to the catalog version. New items are added to your Product
                Catalog (Professional Services) unless you choose “Custom”. Up to 5 scenarios total per quote.
              </p>
            </div>

            {/* Confirmation banner shown before writing new products to the catalog */}
            {confirmCatalog && (
              <div className="mx-5 mb-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  This will add <strong>{newProductCount()}</strong> new product{newProductCount() === 1 ? "" : "s"} to
                  your <strong>Product Catalog</strong> (Professional Services), plus create the scenarios. Continue?
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              <button
                onClick={() => { setPricing(null); setConfirmCatalog(false); }}
                disabled={applyBusy}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={() => {
                  // Ask for confirmation first if any new catalog products would be added.
                  if (!confirmCatalog && newProductCount() > 0) { setConfirmCatalog(true); return; }
                  applyPricing();
                }}
                disabled={applyBusy}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {applyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {confirmCatalog
                  ? `Yes — add ${newProductCount()} product${newProductCount() === 1 ? "" : "s"} & create`
                  : "Create scenarios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
