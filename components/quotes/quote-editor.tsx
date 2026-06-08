"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, Plus, Trash2, Star, FileText, List, Eye, X, Download } from "lucide-react";
import dynamic from "next/dynamic";

// Lazy-load BlockNote to avoid SSR issues
const ProposalEditor = dynamic(
  () => import("./proposal-editor").then(m => m.ProposalEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading editor…</div> }
);
import type { ProposalEditorApi } from "./proposal-editor";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { QuoteStatus, ProductCategory } from "@/types";

// ─── Local types ─────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  scenario_id: string;
  product_id: string | null;
  pricing_tier_id: string | null;
  description: string;
  billing_period: "Monthly" | "One Time" | null;
  quantity: number;
  unit_cost: number | null;
  unit_price: number | null;
  setup_price: number;
  is_taxable: boolean;
  sort_order: number;
}

interface Scenario {
  id: string;
  quote_id: string;
  name: string;
  description: string | null;
  is_recommended: boolean;
  sort_order: number;
  monthly_recurring_total: number;
  onetime_total: number;
  tax_amount: number;
  total: number;
  line_items: LineItem[];
}

interface PricingTier {
  id: string;
  tier_name: string;
  unit_cost: number | null;
  unit_price: number | null;
  is_default: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  item_type: string | null;
  billing_period: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  setup_price: number;
  is_taxable: boolean;
  pricing_tiers: PricingTier[];
}

interface Quote {
  id: string;
  quote_number: string;
  title: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  tax_rate: number | null;
  payment_terms: string | null;
  show_margins: boolean;
  include_header_footer: boolean;
  notes: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document_content: any[] | null;
  client: {
    id: string;
    company_name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
  };
  scenarios: Scenario[];
}

interface Tenant {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
}

interface Props {
  quote: Quote;
  products: Product[];
  categories: ProductCategory[];
  tenant: Tenant | null;
}

// ─── Scenario colour palette (5 pastels, one per slot) ───────────────────────

const SCENARIO_COLORS = [
  {
    tab:    "bg-blue-100 text-blue-800 border-blue-200",
    tabActive: "bg-blue-500 text-white border-blue-500",
    tile:   "bg-blue-50 border-blue-200",
    tileActive: "bg-blue-100 border-blue-500",
    label:  "text-blue-700",
    badge:  "bg-blue-200 text-blue-800",
    divider: "border-blue-200",
  },
  {
    tab:    "bg-violet-100 text-violet-800 border-violet-200",
    tabActive: "bg-violet-500 text-white border-violet-500",
    tile:   "bg-violet-50 border-violet-200",
    tileActive: "bg-violet-100 border-violet-500",
    label:  "text-violet-700",
    badge:  "bg-violet-200 text-violet-800",
    divider: "border-violet-200",
  },
  {
    tab:    "bg-emerald-100 text-emerald-800 border-emerald-200",
    tabActive: "bg-emerald-500 text-white border-emerald-500",
    tile:   "bg-emerald-50 border-emerald-200",
    tileActive: "bg-emerald-100 border-emerald-500",
    label:  "text-emerald-700",
    badge:  "bg-emerald-200 text-emerald-800",
    divider: "border-emerald-200",
  },
  {
    tab:    "bg-amber-100 text-amber-800 border-amber-200",
    tabActive: "bg-amber-500 text-white border-amber-500",
    tile:   "bg-amber-50 border-amber-200",
    tileActive: "bg-amber-100 border-amber-500",
    label:  "text-amber-700",
    badge:  "bg-amber-200 text-amber-800",
    divider: "border-amber-200",
  },
  {
    tab:    "bg-rose-100 text-rose-800 border-rose-200",
    tabActive: "bg-rose-500 text-white border-rose-500",
    tile:   "bg-rose-50 border-rose-200",
    tileActive: "bg-rose-100 border-rose-500",
    label:  "text-rose-700",
    badge:  "bg-rose-200 text-rose-800",
    divider: "border-rose-200",
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcScenarioTotals(items: LineItem[], taxRate: number) {
  const monthly  = items.filter(i => i.billing_period === "Monthly")
    .reduce((s, i) => s + (i.quantity * (i.unit_price ?? 0)), 0);
  const onetime  = items.filter(i => i.billing_period === "One Time")
    .reduce((s, i) => s + (i.quantity * (i.unit_price ?? 0)), 0);
  const taxable  = items.filter(i => i.is_taxable)
    .reduce((s, i) => s + (i.quantity * (i.unit_price ?? 0)), 0);
  const tax      = taxable * taxRate;
  return { monthly, onetime, tax, total: monthly + onetime + tax };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function QuoteEditor({ quote: initialQuote, products, categories, tenant }: Props) {
  const router = useRouter();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const toast = useToast();
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const [scenarios, setScenarios] = useState<Scenario[]>(initialQuote.scenarios);
  const [quoteSaveState, setQuoteSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [activeScenario, setActiveScenario] = useState<string>(
    initialQuote.scenarios[0]?.id ?? ""
  );
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showMargins, setShowMargins] = useState(initialQuote.show_margins);
  const [includeHeaderFooter, setIncludeHeaderFooter] = useState(initialQuote.include_header_footer ?? true);
  const [activeTab, setActiveTab] = useState<"lineitems" | "document">("lineitems");
  // Track whether the Document tab has ever been opened so we don't mount
  // the BlockNote editor while it's hidden (display:none causes ProseMirror
  // to crash because node views can't resolve DOM positions with no layout).
  const [documentEverOpened, setDocumentEverOpened] = useState(false);
  function switchTab(tab: "lineitems" | "document") {
    if (tab === "document") setDocumentEverOpened(true);
    setActiveTab(tab);
  }

  // ProposalEditor API (registered on mount) — flush saves before preview and
  // check whether a pricing table was placed in the document.
  const proposalApiRef = useRef<ProposalEditorApi | null>(null);
  const handleEditorReady = useCallback((api: ProposalEditorApi) => {
    proposalApiRef.current = api;
  }, []);

  // After pricing extraction creates scenarios, refetch them and jump to Line Items.
  const refreshScenarios = useCallback(async () => {
    const { data } = await db
      .from("quote_scenarios")
      .select("*, line_items:quote_line_items(*)")
      .eq("quote_id", initialQuote.id)
      .order("sort_order");
    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sorted = (data as any[]).map((s) => ({
        ...s,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        line_items: [...(s.line_items ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order),
      }));
      setScenarios(sorted);
      setActiveScenario(sorted[0]?.id ?? "");
    }
    setActiveTab("lineitems");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<Scenario | null>(null);

  const taxRate = quote.tax_rate ?? 0;

  // ── Auto-save quote metadata ───────────────────────────────────────────────
  // Debounced save that fires whenever any quote field changes. Replaces the
  // manual Save button — the document body auto-saves itself in ProposalEditor.

  const quoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteFirstRender = useRef(true);

  useEffect(() => {
    // Skip the initial mount so we don't re-save unchanged server data.
    if (quoteFirstRender.current) { quoteFirstRender.current = false; return; }

    setQuoteSaveState("saving");
    if (quoteSaveTimer.current) clearTimeout(quoteSaveTimer.current);
    quoteSaveTimer.current = setTimeout(async () => {
      const { error } = await db.from("quotes").update({
        title:                 quote.title,
        status:                quote.status,
        valid_until:           quote.valid_until,
        tax_rate:              quote.tax_rate,
        payment_terms:         quote.payment_terms,
        notes:                 quote.notes,
        show_margins:          showMargins,
        include_header_footer: includeHeaderFooter,
      }).eq("id", quote.id);

      if (error) {
        toast.error("Failed to save quote");
        setQuoteSaveState("idle");
      } else {
        setQuoteSaveState("saved");
        setTimeout(() => setQuoteSaveState("idle"), 2000);
      }
    }, 1000);

    return () => { if (quoteSaveTimer.current) clearTimeout(quoteSaveTimer.current); };
  // db/toast are stable enough; we intentionally key off the quote fields only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.title, quote.status, quote.valid_until, quote.tax_rate, quote.payment_terms, quote.notes, showMargins, includeHeaderFooter]);

  // ── Preview ────────────────────────────────────────────────────────────────
  // Flush both document + metadata saves first so the server-rendered preview
  // reflects the latest edits, then open the modal.
  async function openPreview() {
    // Attaching pricing is optional — warn (but proceed) if the document has no
    // pricing table placed via the /pricing block.
    if (proposalApiRef.current && !proposalApiRef.current.hasPricingTable()) {
      toast.warning("No pricing table in the document — the proposal will not include pricing. Use “/pricing” to add one.");
    }
    if (quoteSaveTimer.current) clearTimeout(quoteSaveTimer.current);
    await Promise.all([
      proposalApiRef.current?.saveNow(),
      db.from("quotes").update({
        title:                 quote.title,
        status:                quote.status,
        valid_until:           quote.valid_until,
        tax_rate:              quote.tax_rate,
        payment_terms:         quote.payment_terms,
        notes:                 quote.notes,
        show_margins:          showMargins,
        include_header_footer: includeHeaderFooter,
      }).eq("id", quote.id),
    ]);
    setPreviewOpen(true);
  }

  // ── Scenarios ────────────────────────────────────────────────────────────

  async function addScenario() {
    if (scenarios.length >= 5) { toast.error("A quote can have a maximum of 5 scenarios"); return; }
    const { data } = await db.from("quote_scenarios").insert({
      quote_id:   quote.id,
      name:       `Scenario ${String.fromCharCode(65 + scenarios.length)}`,
      sort_order: scenarios.length,
    }).select().single() as { data: Scenario | null };
    if (data) {
      const newScenario = { ...data, line_items: [] };
      setScenarios(prev => [...prev, newScenario]);
      setActiveScenario(data.id);
      toast.success(`${data.name} added`);
    }
  }

  async function updateScenarioName(id: string, name: string) {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, name } : s));
    const { error } = await db.from("quote_scenarios").update({ name }).eq("id", id);
    if (error) toast.error("Failed to save scenario name");
  }

  // Which scenario (if any) becomes the recommended default after deleting `s`.
  // Only relevant when the deleted scenario was itself the recommended one.
  function nextDefaultAfterDelete(s: Scenario): Scenario | null {
    if (!s.is_recommended) return null;
    const remaining = scenarios.filter(x => x.id !== s.id).sort((a, b) => a.sort_order - b.sort_order);
    return remaining[0] ?? null;
  }

  // scenarioRef values of every pricing table in the document. Prefers the live
  // editor (reflects unsaved edits); falls back to the saved document_content
  // when the Document tab hasn't been opened this session (editor not mounted).
  function getDocumentScenarioRefs(): string[] {
    if (proposalApiRef.current) return proposalApiRef.current.documentScenarioRefs();
    const blocks = Array.isArray(quote.document_content) ? quote.document_content : [];
    return blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b?.type === "scenarioTable")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => String(b?.props?.scenarioRef ?? "recommended"));
  }

  // Does the document reference this scenario (directly, via "all", or via
  // "recommended" when this scenario is the recommended one)?
  function documentReferencesScenario(s: Scenario): boolean {
    const refs = getDocumentScenarioRefs();
    return refs.some(r => r === s.id || r === "all" || (r === "recommended" && s.is_recommended));
  }

  async function confirmDeleteScenario(s: Scenario) {
    setScenarioToDelete(null);
    if (scenarios.length === 1) return;

    const newDefault = nextDefaultAfterDelete(s);

    await db.from("quote_scenarios").delete().eq("id", s.id);
    const remaining = scenarios.filter(x => x.id !== s.id);
    // Preserve custom names. Only close the sort_order gap and promote a new
    // recommended default if the deleted scenario was the recommended one.
    const updated = remaining
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((x, i) => ({
        ...x,
        sort_order:     i,
        is_recommended: newDefault ? x.id === newDefault.id : x.is_recommended,
      }));
    await Promise.all(
      updated.map(x =>
        db.from("quote_scenarios")
          .update({ sort_order: x.sort_order, is_recommended: x.is_recommended })
          .eq("id", x.id)
      )
    );
    setScenarios(updated);
    setActiveScenario(updated[0]?.id ?? "");
    if (newDefault) {
      toast.success(`Scenario deleted — “${updated.find(x => x.id === newDefault.id)?.name}” is now recommended`);
    } else {
      toast.success("Scenario deleted");
    }
  }

  async function setRecommended(id: string) {
    // Clear all, then set this one
    for (const s of scenarios) {
      await db.from("quote_scenarios").update({ is_recommended: s.id === id }).eq("id", s.id);
    }
    setScenarios(prev => prev.map(s => ({ ...s, is_recommended: s.id === id })));
  }

  // ── Line items ───────────────────────────────────────────────────────────

  async function addProductToScenario(product: Product, tierId?: string) {
    const tier = tierId
      ? product.pricing_tiers.find(t => t.id === tierId)
      : product.pricing_tiers.find(t => t.is_default) ?? product.pricing_tiers[0];

    const scenario = scenarios.find(s => s.id === activeScenario);
    if (!scenario) return;

    const payload = {
      scenario_id:     activeScenario,
      product_id:      product.id,
      pricing_tier_id: tier?.id ?? null,
      description:     product.name,
      billing_period:  product.billing_period ?? null,
      quantity:        1,
      unit_cost:       tier?.unit_cost ?? product.unit_cost,
      unit_price:      tier?.unit_price ?? product.unit_price,
      setup_price:     product.setup_price,
      is_taxable:      product.is_taxable,
      sort_order:      scenario.line_items.length,
    };

    const { data } = await db.from("quote_line_items").insert(payload).select().single() as { data: LineItem | null };
    if (!data) return;

    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenario) return s;
      const newItems = [...s.line_items, data];
      const totals = calcScenarioTotals(newItems, taxRate);
      return { ...s, line_items: newItems, ...totals };
    }));

    // Persist scenario totals
    const scenario2 = scenarios.find(s => s.id === activeScenario)!;
    const newItems = [...scenario2.line_items, data];
    const totals = calcScenarioTotals(newItems, taxRate);
    await db.from("quote_scenarios").update({
      monthly_recurring_total: totals.monthly,
      onetime_total:           totals.onetime,
      tax_amount:              totals.tax,
      total:                   totals.total,
    }).eq("id", activeScenario);

    toast.success(`${product.name} added to ${currentScenario?.name ?? "scenario"}`);
    setProductSearchOpen(false);
    setProductSearch("");
  }

  async function addFreeTextItem() {
    const scenario = scenarios.find(s => s.id === activeScenario);
    if (!scenario) return;

    const payload = {
      scenario_id:  activeScenario,
      description:  "New item",
      billing_period: "Monthly" as const,
      quantity:     1,
      unit_cost:    null,
      unit_price:   null,
      setup_price:  0,
      is_taxable:   false,
      sort_order:   scenario.line_items.length,
    };

    const { data } = await db.from("quote_line_items").insert(payload).select().single() as { data: LineItem | null };
    if (data) {
      setScenarios(prev => prev.map(s =>
        s.id === activeScenario ? { ...s, line_items: [...s.line_items, data] } : s
      ));
    }
  }

  async function updateLineItem(scenarioId: string, itemId: string, patch: Partial<LineItem>) {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId) return s;
      const newItems = s.line_items.map(i => i.id === itemId ? { ...i, ...patch } : i);
      const totals = calcScenarioTotals(newItems, taxRate);
      return { ...s, line_items: newItems, ...totals };
    }));
    await db.from("quote_line_items").update(patch).eq("id", itemId);
    // persist scenario totals
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (scenario) {
      const newItems = scenario.line_items.map(i => i.id === itemId ? { ...i, ...patch } : i);
      const totals = calcScenarioTotals(newItems, taxRate);
      await db.from("quote_scenarios").update({
        monthly_recurring_total: totals.monthly,
        onetime_total:           totals.onetime,
        tax_amount:              totals.tax,
        total:                   totals.total,
      }).eq("id", scenarioId);
    }
  }

  async function deleteLineItem(scenarioId: string, itemId: string) {
    await db.from("quote_line_items").delete().eq("id", itemId);
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId) return s;
      const newItems = s.line_items.filter(i => i.id !== itemId);
      const totals = calcScenarioTotals(newItems, taxRate);
      return { ...s, line_items: newItems, ...totals };
    }));
  }

  // ── Product search filter ────────────────────────────────────────────────

  const filteredProducts = products.filter(p => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
  });

  const currentScenarioIdx = scenarios.findIndex(s => s.id === activeScenario);
  const currentScenario    = scenarios[currentScenarioIdx];
  const activeColor        = SCENARIO_COLORS[currentScenarioIdx % SCENARIO_COLORS.length];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-6 py-3 border-b bg-background shrink-0">
        <button
          onClick={() => router.push("/quotes")}
          className="p-1.5 rounded hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{quote.quote_number || "Generating…"}</span>
            <input
              value={quote.title ?? ""}
              onChange={(e) => setQuote(q => ({ ...q, title: e.target.value }))}
              placeholder="Untitled Quote"
              className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 p-0 flex-1 min-w-0"
            />
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {quote.client.company_name}
            {quote.client.contact_name ? ` — ${quote.client.contact_name}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status */}
          <select
            value={quote.status}
            onChange={(e) => setQuote(q => ({ ...q, status: e.target.value as QuoteStatus }))}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(["draft","sent","viewed","signed","declined","expired"] as QuoteStatus[]).map(s => (
              <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer"
            title="Show internal cost & profit margin (never shown to the client)"
          >
            <input type="checkbox" checked={showMargins} onChange={e => { setShowMargins(e.target.checked); }} className="rounded" />
            Profit margins
          </label>

          <button
            onClick={openPreview}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>

          {/* Auto-save status (replaces the manual Save button) */}
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs min-w-[72px] justify-end transition-colors duration-300",
              quoteSaveState === "saving" ? "text-muted-foreground" :
              quoteSaveState === "saved"  ? "text-green-600" :
              "text-muted-foreground/50"
            )}
          >
            {quoteSaveState === "saving" ? (
              <><Save className="w-3.5 h-3.5 animate-pulse" /> Saving…</>
            ) : (
              <><Check className="w-3.5 h-3.5" /> Saved</>
            )}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Tab bar + content */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Main tab bar */}
          <div className="flex items-center gap-1 px-6 pt-4 border-b bg-background shrink-0">
            <button
              title="Build pricing: products, line items, and scenario options for the quote"
              onClick={() => switchTab("lineitems")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors",
                activeTab === "lineitems"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="w-4 h-4" />
              Pricing Scenarios
            </button>
            <button
              title="Write the proposal narrative (cover letter, scope, terms) and place pricing tables"
              onClick={() => switchTab("document")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors",
                activeTab === "document"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText className="w-4 h-4" />
              Document
            </button>
          </div>

          {/* Document tab — mounted on first visit, then kept alive (CSS-hidden)
              so the editor instance persists across tab switches without losing
              unsaved content or triggering a second ProseMirror initialisation. */}
          {documentEverOpened && (
          <div className={cn("flex-1 overflow-hidden", activeTab !== "document" && "hidden")}>
            <ProposalEditor
              quoteId={quote.id}
              initialContent={quote.document_content}
              clientData={quote.client}
              tenantData={tenant}
              scenarios={scenarios}
              taxRate={taxRate}
              showMargins={showMargins}
              onReady={handleEditorReady}
              onPricingApplied={refreshScenarios}
            />
          </div>
          )}

          {/* Line Items tab */}
          {activeTab === "lineitems" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Scenario tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {scenarios.map((s, idx) => {
              const color = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveScenario(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                    activeScenario === s.id ? color.tabActive : color.tab
                  )}
                >
                  {s.is_recommended && <Star className="w-3 h-3 fill-current" />}
                  {s.name}
                </button>
              );
            })}
            {scenarios.length < 5 ? (
              <button
                onClick={addScenario}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm border border-dashed text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Scenario
              </button>
            ) : (
              <span className="text-xs text-muted-foreground italic px-1">
                Maximum of 5 scenarios reached
              </span>
            )}
          </div>

          {/* Active scenario */}
          {currentScenario && (
            <div className="rounded-lg border overflow-hidden">
              {/* Scenario header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b">
                <input
                  value={currentScenario.name}
                  onChange={(e) => updateScenarioName(currentScenario.id, e.target.value)}
                  className="font-semibold bg-transparent border-none outline-none focus:ring-0 p-0 flex-1"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRecommended(currentScenario.id)}
                    title="Mark as recommended"
                    className={cn(
                      "p-1 rounded transition-colors",
                      currentScenario.is_recommended
                        ? "text-yellow-500"
                        : "text-muted-foreground hover:text-yellow-500"
                    )}
                  >
                    <Star className={cn("w-4 h-4", currentScenario.is_recommended && "fill-current")} />
                  </button>
                  {scenarios.length > 1 && (
                    <button
                      onClick={() => setScenarioToDelete(currentScenario)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Line items table */}
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Billing</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Qty</th>
                    {showMargins && <th className="text-right px-4 py-2 font-medium text-muted-foreground">Cost</th>}
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Unit Price</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                    {showMargins && <th className="text-right px-4 py-2 font-medium text-muted-foreground">Margin</th>}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {currentScenario.line_items.length === 0 ? (
                    <tr>
                      <td colSpan={showMargins ? 8 : 6} className="text-center py-8 text-muted-foreground text-sm">
                        No line items yet — add products below.
                      </td>
                    </tr>
                  ) : (
                    currentScenario.line_items.map((item) => {
                      const lineTotal = item.quantity * (item.unit_price ?? 0);
                      const margin = item.unit_price && item.unit_cost && item.unit_price > 0
                        ? (((item.unit_price - item.unit_cost) / item.unit_price) * 100)
                        : null;

                      return (
                        <tr key={item.id} className="hover:bg-muted/10 group">
                          <td className="px-4 py-2">
                            <input
                              value={item.description}
                              onChange={(e) => updateLineItem(currentScenario.id, item.id, { description: e.target.value })}
                              className="w-full bg-transparent border-none outline-none focus:ring-0 p-0"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={item.billing_period ?? ""}
                              onChange={(e) => updateLineItem(currentScenario.id, item.id, { billing_period: e.target.value as "Monthly" | "One Time" })}
                              className="bg-transparent border-none outline-none text-sm text-muted-foreground focus:ring-0 p-0"
                            >
                              <option value="Monthly">Monthly</option>
                              <option value="One Time">One Time</option>
                            </select>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={Math.round(item.quantity)}
                              onChange={(e) => updateLineItem(currentScenario.id, item.id, { quantity: parseInt(e.target.value) || 1 })}
                              className="w-16 text-right bg-transparent border-none outline-none focus:ring-0 p-0"
                            />
                          </td>
                          {showMargins && (
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={item.unit_cost ?? ""}
                                onChange={(e) => updateLineItem(currentScenario.id, item.id, { unit_cost: parseFloat(e.target.value) || null })}
                                className="w-20 text-right bg-transparent border-none outline-none focus:ring-0 p-0 text-muted-foreground"
                              />
                            </td>
                          )}
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price ?? ""}
                              onChange={(e) => updateLineItem(currentScenario.id, item.id, { unit_price: parseFloat(e.target.value) || null })}
                              className="w-24 text-right bg-transparent border-none outline-none focus:ring-0 p-0 font-medium"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-medium tabular-nums">
                            {formatCurrency(lineTotal)}
                          </td>
                          {showMargins && (
                            <td className="px-4 py-2 text-right tabular-nums">
                              {margin != null ? (
                                <span className={cn(
                                  "text-xs font-medium",
                                  margin >= 30 ? "text-green-600" :
                                  margin >= 15 ? "text-yellow-600" : "text-red-600"
                                )}>
                                  {margin.toFixed(1)}%
                                </span>
                              ) : "—"}
                            </td>
                          )}
                          <td className="px-2 py-2">
                            <button
                              onClick={() => deleteLineItem(currentScenario.id, item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Totals footer */}
                {currentScenario.line_items.length > 0 && (() => {
                  const t = calcScenarioTotals(currentScenario.line_items, taxRate);
                  const cols = showMargins ? 5 : 4;
                  return (
                    <tfoot className={cn("border-t", activeColor.tile)}>
                      <tr>
                        <td colSpan={cols} className={cn("px-4 py-2 text-sm text-right", activeColor.label)}>
                          Monthly Recurring
                        </td>
                        <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", activeColor.label)}>
                          {formatCurrency(t.monthly)}
                        </td>
                        {showMargins && <td />}
                        <td />
                      </tr>
                      <tr>
                        <td colSpan={cols} className={cn("px-4 py-2 text-sm text-right", activeColor.label)}>
                          One-Time
                        </td>
                        <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", activeColor.label)}>
                          {formatCurrency(t.onetime)}
                        </td>
                        {showMargins && <td />}
                        <td />
                      </tr>
                      {taxRate > 0 && (
                        <tr>
                          <td colSpan={cols} className={cn("px-4 py-2 text-sm text-right", activeColor.label)}>
                            Tax ({(taxRate * 100).toFixed(2)}%)
                          </td>
                          <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", activeColor.label)}>
                            {formatCurrency(t.tax)}
                          </td>
                          {showMargins && <td />}
                          <td />
                        </tr>
                      )}
                      <tr className={cn("border-t-2", activeColor.divider)}>
                        <td colSpan={cols} className={cn("px-4 py-2 text-sm font-bold text-right", activeColor.label)}>
                          Total
                        </td>
                        <td className={cn("px-4 py-2 text-right font-bold tabular-nums", activeColor.label)}>
                          {formatCurrency(t.monthly + t.onetime + t.tax)}
                        </td>
                        {showMargins && <td />}
                        <td />
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>

              {/* Add item buttons */}
              <div className="px-4 py-3 border-t bg-muted/10 flex items-center gap-2">
                <button
                  onClick={() => setProductSearchOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add from catalog
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={addFreeTextItem}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add free-text item
                </button>
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        {/* Right: Quote details panel */}
        <aside className="w-72 shrink-0 border-l overflow-y-auto p-5 space-y-6 bg-muted/5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quote Details</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Valid Until</label>
                <input
                  type="date"
                  value={quote.valid_until ?? ""}
                  onChange={(e) => setQuote(q => ({ ...q, valid_until: e.target.value }))}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={quote.tax_rate != null ? (quote.tax_rate * 100).toFixed(2) : ""}
                  onChange={(e) => setQuote(q => ({ ...q, tax_rate: parseFloat(e.target.value) / 100 || null }))}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Payment Terms</label>
                <input
                  value={quote.payment_terms ?? ""}
                  onChange={(e) => setQuote(q => ({ ...q, payment_terms: e.target.value }))}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Net 30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Internal Notes</label>
                <textarea
                  value={quote.notes ?? ""}
                  onChange={(e) => setQuote(q => ({ ...q, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
          </section>

          {/* PDF options */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PDF Options</h3>
            <label className="flex items-start gap-2 cursor-pointer rounded-md border bg-background p-3">
              <input
                type="checkbox"
                checked={includeHeaderFooter}
                onChange={(e) => setIncludeHeaderFooter(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-sm">
                Header &amp; footer
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Company name, quote number, confidentiality line, and page numbers on every page after the cover.
                </span>
              </span>
            </label>
          </section>

          {/* Client info */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</h3>
            <div className="rounded-lg border bg-background p-3 text-sm space-y-0.5">
              <p className="font-medium">{quote.client.company_name}</p>
              {quote.client.contact_name  && <p className="text-muted-foreground">{quote.client.contact_name}</p>}
              {quote.client.contact_email && <p className="text-muted-foreground">{quote.client.contact_email}</p>}
              {quote.client.contact_phone && <p className="text-muted-foreground">{quote.client.contact_phone}</p>}
              {quote.client.address       && <p className="text-muted-foreground text-xs mt-1">{quote.client.address}</p>}
            </div>
          </section>

          {/* Scenario summaries */}
          {scenarios.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scenario Totals</h3>
              <div className="space-y-2">
                {scenarios.map((s, idx) => {
                  const totals = calcScenarioTotals(s.line_items, taxRate);
                  const color  = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
                  // Internal profit margin across line items that have a cost set.
                  const costed = s.line_items.filter(i => i.unit_cost != null && i.unit_price != null);
                  const mRev  = costed.reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
                  const mCost = costed.reduce((sum, i) => sum + i.quantity * (i.unit_cost ?? 0), 0);
                  const marginPct = mRev > 0 ? ((mRev - mCost) / mRev) * 100 : null;
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "rounded-lg border p-3 text-sm cursor-pointer transition-colors",
                        activeScenario === s.id ? color.tileActive : color.tile
                      )}
                      onClick={() => setActiveScenario(s.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn("font-semibold", color.label)}>{s.name}</span>
                        {s.is_recommended && (
                          <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", color.badge)}>
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className={cn("text-xs", color.label)}>Monthly: {formatCurrency(totals.monthly)}/mo</p>
                      <p className={cn("text-xs", color.label)}>One-time: {formatCurrency(totals.onetime)}</p>
                      {totals.tax > 0 && (
                        <p className={cn("text-xs", color.label)}>
                          Tax ({((quote.tax_rate ?? 0) * 100).toFixed(2)}%): {formatCurrency(totals.tax)}
                        </p>
                      )}
                      <p className={cn("text-xs font-bold border-t mt-1.5 pt-1.5", color.label, color.divider)}>
                        Total: {formatCurrency(totals.monthly + totals.onetime + totals.tax)}
                      </p>
                      {showMargins && (
                        <p className={cn("text-xs mt-1", color.label)}>
                          Margin:{" "}
                          <span className={cn(
                            "font-semibold",
                            marginPct == null ? "" :
                            marginPct >= 30 ? "text-green-600" :
                            marginPct >= 15 ? "text-yellow-600" : "text-red-600"
                          )}>
                            {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* Product search overlay */}
      {productSearchOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => { setProductSearchOpen(false); setProductSearch(""); }}
          />
          <div className="fixed left-1/2 top-1/4 -translate-x-1/2 z-50 bg-background rounded-xl border shadow-2xl w-full max-w-xl max-h-[60vh] flex flex-col">
            <div className="px-4 py-3 border-b">
              <input
                autoFocus
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full bg-transparent border-none outline-none text-sm"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredProducts.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No products found</p>
              ) : (
                filteredProducts.map((p) => {
                  const defaultTier = p.pricing_tiers.find(t => t.is_default) ?? p.pricing_tiers[0];
                  const price = defaultTier?.unit_price ?? p.unit_price;
                  return (
                    <div key={p.id} className="border-b last:border-0">
                      <button
                        onClick={() => addProductToScenario(p)}
                        className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.item_type} · {p.billing_period ?? "—"}
                            </p>
                          </div>
                          <span className="text-sm font-medium tabular-nums">{formatCurrency(price)}</span>
                        </div>
                      </button>
                      {/* Show tier options if multiple */}
                      {p.pricing_tiers.length > 1 && (
                        <div className="px-4 pb-2 flex gap-2 flex-wrap">
                          {p.pricing_tiers.map(tier => (
                            <button
                              key={tier.id}
                              onClick={() => addProductToScenario(p, tier.id)}
                              className="text-xs rounded-full border px-2 py-0.5 hover:bg-muted transition-colors"
                            >
                              {tier.tier_name} — {formatCurrency(tier.unit_price)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50">
          <div className="flex items-center justify-between px-6 py-3 bg-background border-b shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Preview — {quote.quote_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/quotes/${quote.id}/pdf`}
                className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </a>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden bg-muted/20 p-4">
            <iframe
              src={`/api/quotes/${quote.id}/preview`}
              title="Quote preview"
              className="w-full h-full bg-white rounded-lg shadow-xl border"
            />
          </div>
        </div>
      )}

      {/* Delete-scenario confirmation */}
      {scenarioToDelete && (() => {
        const s = scenarioToDelete;
        const newDefault = nextDefaultAfterDelete(s);
        const referenced = documentReferencesScenario(s);
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setScenarioToDelete(null)} />
            <div className="fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-background rounded-xl border shadow-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0 rounded-full bg-destructive/10 p-2">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Delete “{s.name}”?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    This permanently deletes the scenario and its line items. This can’t be undone.
                  </p>

                  <div className="mt-3 space-y-2 text-sm">
                    {s.is_recommended && newDefault && (
                      <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                        “{s.name}” is the <strong>recommended</strong> scenario. After deletion,{" "}
                        <strong>“{newDefault.name}”</strong> will automatically become the recommended default.
                      </div>
                    )}
                    {referenced && (
                      <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                        “{s.name}” is currently <strong>used by a pricing table in the Document</strong>.
                        Deleting it will leave that table without a valid scenario — after deleting, open the{" "}
                        <strong>Document</strong> tab and review or repoint that pricing table.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setScenarioToDelete(null)}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmDeleteScenario(s)}
                  className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Delete scenario
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
