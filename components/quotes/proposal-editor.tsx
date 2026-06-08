"use client";

import { useEffect, useRef, useCallback, useState, createContext, useContext } from "react";
import {
  useCreateBlockNote,
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { AlignLeft, AlignCenter, AlignRight, Scissors, ChevronDown, Table2, Sparkles, Loader2, Undo2, Redo2, Check, X, FileUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { scenarioColor } from "@/lib/scenario-colors";
import { htmlToBlocks } from "@/lib/import/html-to-blocks";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

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

// ─── Custom: Scenario / Pricing table block ───────────────────────────────────
// Stores a *reference* (scenarioRef), not a snapshot — so the table stays live
// as line items are edited. Live scenario data is supplied via React context
// (BlockNote block render functions can't receive parent props directly).

export interface EditorLineItem {
  billing_period: "Monthly" | "One Time" | null;
  quantity: number;
  unit_price: number | null;
  is_taxable: boolean;
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
}
const ScenarioContext = createContext<ScenarioCtx>({ scenarios: [], taxRate: 0 });

function scenarioMonthly(s: EditorScenario) {
  return s.line_items.filter(i => i.billing_period === "Monthly")
    .reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
}
function scenarioOnetime(s: EditorScenario) {
  return s.line_items.filter(i => i.billing_period === "One Time")
    .reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScenarioTableView({ block, editor }: { block: any; editor: any }) {
  const { scenarios } = useContext(ScenarioContext);
  const ref: string = block.props?.scenarioRef ?? "recommended";

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
          Referenced scenario no longer exists — pick another above.
        </div>
      ) : shown.map(s => {
        const monthly = scenarioMonthly(s);
        const onetime = scenarioOnetime(s);
        const c = scenarioColor(sorted.findIndex(x => x.id === s.id));
        return (
          <table key={s.id} style={{
            width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 11,
            border: `1px solid ${c.border}`,
          }}>
            <thead>
              <tr>
                <th colSpan={3} style={{
                  textAlign: "left", background: c.headBg, color: c.headText,
                  padding: "6px 8px", border: `1px solid ${c.border}`, fontSize: 12,
                }}>
                  {s.name}{s.is_recommended ? " ★" : ""}
                </th>
              </tr>
            </thead>
            <tbody>
              {s.line_items.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: "6px 8px", color: "#94a3b8", textAlign: "center" }}>No line items</td></tr>
              ) : s.line_items.map((i, idx) => (
                <tr key={idx}>
                  <td style={{ padding: "4px 8px", border: "1px solid #f1f5f9" }}>{i.billing_period ?? "—"}</td>
                  <td style={{ padding: "4px 8px", border: "1px solid #f1f5f9", textAlign: "right" }}>×{Math.round(i.quantity)}</td>
                  <td style={{ padding: "4px 8px", border: "1px solid #f1f5f9", textAlign: "right" }}>{formatCurrency(i.quantity * (i.unit_price ?? 0))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={2} style={{ padding: "4px 8px", textAlign: "right", background: c.footBg, color: c.footText }}>Monthly</td><td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, background: c.footBg, color: c.footText }}>{formatCurrency(monthly)}</td></tr>
              <tr><td colSpan={2} style={{ padding: "4px 8px", textAlign: "right", background: c.footBg, color: c.footText }}>One-time</td><td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, background: c.footBg, color: c.footText }}>{formatCurrency(onetime)}</td></tr>
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
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    pageBreak: PageBreakBlock,
    scenarioTable: ScenarioTableBlock,
  },
});

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
  { label: "Company Name",  token: "{{client.company_name}}"  },
  { label: "Contact Name",  token: "{{client.contact_name}}"  },
  { label: "Email",         token: "{{client.email}}"         },
  { label: "Phone",         token: "{{client.phone}}"         },
  { label: "Address",       token: "{{client.address}}"       },
];

const TENANT_VARS: FieldVariable[] = [
  { label: "Company Name",  token: "{{tenant.company_name}}"  },
  { label: "Contact Name",  token: "{{tenant.contact_name}}"  },
  { label: "Email",         token: "{{tenant.email}}"         },
  { label: "Phone",         token: "{{tenant.phone}}"         },
  { label: "Address",       token: "{{tenant.address}}"       },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientData {
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
}

interface TenantData {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface Props {
  quoteId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialContent: any[] | null;
  clientData: ClientData | null;
  tenantData: TenantData | null;
  /** Live scenario data for the inline pricing-table block previews. */
  scenarios: EditorScenario[];
  taxRate: number;
  /** Called once on mount with an API the parent can invoke (save flush + checks). */
  onReady?: (api: ProposalEditorApi) => void;
}

export interface ProposalEditorApi {
  /** Flush any pending document save immediately. */
  saveNow: () => Promise<void>;
  /** True if the live document contains at least one pricing/scenario table. */
  hasPricingTable: () => boolean;
  /** scenarioRef values of every pricing table in the live document
   *  (e.g. "recommended", "all", or a specific scenario id). */
  documentScenarioRefs: () => string[];
}

type TextAlignment = "left" | "center" | "right";

// ─── Component ────────────────────────────────────────────────────────────────

export function ProposalEditor({ quoteId, initialContent, clientData, tenantData, scenarios, taxRate, onReady }: Props) {
  const supabaseRef = useRef(createClient());
  const quoteIdRef  = useRef(quoteId);
  const toast       = useToast();
  const toastRef    = useRef(toast);
  toastRef.current  = toast;

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirty    = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

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
    contentLoaded.current = true;
    if (!initialContent || initialContent.length === 0) return;

    const raf = requestAnimationFrame(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.replaceBlocks(editor.document, initialContent as any);
        // Ignore the onChange triggered by this programmatic load so we don't
        // immediately re-save identical content back to Supabase.
        skipNextChange.current = true;
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
      .from("quotes")
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
      hasPricingTable: () => editorRef.current.document.some(b => b.type === "scenarioTable"),
      documentScenarioRefs: () =>
        editorRef.current.document
          .filter(b => b.type === "scenarioTable")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(b => String((b.props as any)?.scenarioRef ?? "recommended")),
    });
  // save is stable; onReady is memoised by the parent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  // Subscribe directly to editor.onChange — bypasses BlockNoteView's prop
  // wiring (which can lose the subscription across re-renders) and fires for
  // every TipTap transaction including programmatic ones.
  useEffect(() => {
    return editor.onChange(() => {
      if (skipNextChange.current) { skipNextChange.current = false; return; }
      scheduleSave();
    });
  }, [editor, scheduleSave]);

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
  function aiTextToNodes(t: string) {
    const paras = t.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    if (paras.length === 0) return [{ type: "paragraph" }];
    return paras.map(p => ({
      type: "paragraph",
      content: [{ type: "text", text: p.replace(/\s*\n\s*/g, " ") }],
    }));
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
    // insertContentAt replaces [from,to] for selection edits, or inserts at the
    // cursor when from === to (generate/continue).
    tt().chain().focus().insertContentAt({ from, to }, aiTextToNodes(suggested)).run();
    scheduleSave();
    setAiSuggestion(null);
    toastRef.current.success("Applied — use Undo to revert");
  }

  function discardSuggestion() {
    setAiSuggestion(null);
  }

  // ── Import .docx / .md ────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    const name = file.name.toLowerCase();
    const isMd = name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt");
    const isDocx = name.endsWith(".docx");
    if (!isMd && !isDocx) {
      toastRef.current.error("Please choose a .docx or .md file");
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
      // Fill an empty document, otherwise insert after the cursor.
      const doc = ed.document;
      const docEmpty =
        doc.length === 1 && doc[0].type === "paragraph" &&
        (!doc[0].content || (Array.isArray(doc[0].content) && doc[0].content.length === 0));
      if (docEmpty) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ed.replaceBlocks(ed.document, blocks as any);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ed.insertBlocks(blocks as any, ed.getTextCursorPosition().block, "after");
      }
      scheduleSave();
      toastRef.current.success("Document imported — use Undo if needed");
    } catch (e) {
      toastRef.current.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

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

  // ── Render ──────────────────────────────────────────────────────────────

  const alignButtons: { alignment: TextAlignment; icon: React.ReactNode; label: string }[] = [
    { alignment: "left",   icon: <AlignLeft   className="w-3.5 h-3.5" />, label: "Align left"   },
    { alignment: "center", icon: <AlignCenter className="w-3.5 h-3.5" />, label: "Align center" },
    { alignment: "right",  icon: <AlignRight  className="w-3.5 h-3.5" />, label: "Align right"  },
  ];

  const active = currentAlignment();

  // Resolve display value for a variable token (shows actual data if available)
  function tokenPreview(token: string): string {
    if (clientData) {
      if (token === "{{client.company_name}}")  return clientData.company_name   || token;
      if (token === "{{client.contact_name}}")  return clientData.contact_name   || token;
      if (token === "{{client.email}}")          return clientData.contact_email  || token;
      if (token === "{{client.phone}}")          return clientData.contact_phone  || token;
      if (token === "{{client.address}}")        return clientData.address        || token;
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

      {/* Persistent toolbar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-muted/10 shrink-0">

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-r pr-2 mr-1">
          <button
            title="Undo (⌘Z)"
            onMouseDown={(e) => { e.preventDefault(); tt().chain().focus().undo().run(); scheduleSave(); }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            title="Redo (⌘⇧Z)"
            onMouseDown={(e) => { e.preventDefault(); tt().chain().focus().redo().run(); scheduleSave(); }}
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
        </div>

        {/* Insert Field dropdown */}
        <div className="relative border-r pr-2 mr-1">
          <button
            onMouseDown={(e) => { e.preventDefault(); setFieldMenuOpen(o => !o); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Insert Field <ChevronDown className="w-3 h-3" />
          </button>

          {fieldMenuOpen && (
            <>
              {/* Overlay to close on outside click */}
              <div
                className="fixed inset-0 z-10"
                onMouseDown={() => setFieldMenuOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1 z-20 w-72 rounded-lg border border-violet-200 bg-violet-50 shadow-xl overflow-hidden">

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

        {/* Ask AI dropdown */}
        <div className="relative border-r pr-2 mr-1">
          <button
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

        {/* Import .docx / .md */}
        <div className="border-r pr-2 mr-1">
          <button
            title="Import a .docx or .md file"
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
            accept=".docx,.md,.markdown,.txt"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
          />
        </div>

        <p className="text-xs text-muted-foreground flex-1">
          Type <kbd className="px-1 py-0.5 rounded border text-xs bg-muted">/</kbd> for blocks · Select text to format
        </p>
        <span className={cn(
          "text-xs transition-colors duration-300",
          saveState === "saving" ? "text-muted-foreground" :
          saveState === "saved"  ? "text-green-600" :
          "text-transparent"
        )}>
          {saveState === "saving" ? "Saving…" : "Saved ✓"}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto overflow-x-visible">
        <div className="overflow-x-visible px-2 py-4">
            <ScenarioContext.Provider value={{ scenarios, taxRate }}>
              <BlockNoteView
                editor={editor}
                theme="light"
                slashMenu={false}
              >
                <SuggestionMenuController
                  triggerCharacter="/"
                  getItems={async (query) =>
                    filterSuggestionItems(
                      [
                        ...getDefaultReactSlashMenuItems(editor),
                        getPageBreakSlashItem(editor),
                        getScenarioSlashItem(editor),
                      ],
                      query
                    )
                  }
                />
              </BlockNoteView>
            </ScenarioContext.Provider>
          </div>
      </div>

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
    </div>
  );
}
