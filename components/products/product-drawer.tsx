"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useTenantId } from "@/lib/supabase/use-tenant";
import { useToast } from "@/components/ui/toast";
import type { ProductCategory } from "@/types";

interface PricingTier {
  id?: string;
  /** Stable client-side React key (never persisted) — survives delete/reorder
   *  so input state stays attached to the right tier. */
  _uid?: string;
  tier_name: string;
  description: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  is_default: boolean;
  sort_order: number;
}

function newUid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tier-${Math.random().toString(36).slice(2)}`;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  item_type: string | null;
  billing_period: string | null;
  unit: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  setup_price: number;
  is_taxable: boolean;
  is_price_overrideable: boolean;
  is_active: boolean;
  manufacturer: string | null;
  manufacturer_part_no: string | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  autotask_id: string | null;
  quickbooks_online_id: string | null;
  category: { id: string; name: string } | null;
  pricing_tiers: PricingTier[];
}

interface Props {
  /** Members get a view-only drawer (products are owner-managed). */
  readOnly?: boolean;
  open: boolean;
  product: ProductRow | null;
  categories: ProductCategory[];
  onClose: () => void;
  onSaved: () => void;
}

const ITEM_TYPES = ["Service", "Hardware", "Software", "Other"];
const BILLING_PERIODS = ["Monthly", "One Time"];

export function ProductDrawer({ open, product, categories, onClose, onSaved, readOnly }: Props) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const toast = useToast();
  const tenantId = useTenantId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState("");
  const [billingPeriod, setBillingPeriod] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [setupPrice, setSetupPrice] = useState("0");
  const [unit, setUnit] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [manufacturerPartNo, setManufacturerPartNo] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [isTaxable, setIsTaxable] = useState(false);
  const [isPriceOverrideable, setIsPriceOverrideable] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  // Scroll the most-recently-added tier into view (it appends at the bottom,
  // often below the fold) and focus its name field.
  const tiersEndRef = useRef<HTMLDivElement | null>(null);
  const scrollToNewTier = useRef(false);

  // Populate form when product changes
  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
      setItemType(product.item_type ?? "");
      setBillingPeriod(product.billing_period ?? "");
      setCategoryId(product.category?.id ?? "");
      setUnitCost(product.unit_cost?.toString() ?? "");
      setUnitPrice(product.unit_price?.toString() ?? "");
      setSetupPrice(product.setup_price?.toString() ?? "0");
      setUnit(product.unit ?? "");
      setManufacturer(product.manufacturer ?? "");
      setManufacturerPartNo(product.manufacturer_part_no ?? "");
      setSupplierName(product.supplier_name ?? "");
      setSupplierSku(product.supplier_sku ?? "");
      setIsTaxable(product.is_taxable);
      setIsPriceOverrideable(product.is_price_overrideable);
      setIsActive(product.is_active);
      setTiers(product.pricing_tiers.map((t) => ({ ...t, _uid: newUid() })));
    } else {
      setName(""); setDescription(""); setItemType(""); setBillingPeriod("");
      setCategoryId(""); setUnitCost(""); setUnitPrice(""); setSetupPrice("0");
      setUnit(""); setManufacturer(""); setManufacturerPartNo("");
      setSupplierName(""); setSupplierSku(""); setIsTaxable(false);
      setIsPriceOverrideable(false); setIsActive(true);
      setTiers([{ _uid: newUid(), tier_name: "Default Pricing", description: null, unit_cost: null, unit_price: null, is_default: true, sort_order: 0 }]);
    }
    setError(null);
  }, [product, open]);

  async function handleSave() {
    if (!name.trim()) { setError("Product name is required"); return; }
    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description || null,
        item_type: itemType || null,
        billing_period: billingPeriod || null,
        category_id: categoryId || null,
        unit_cost: unitCost ? parseFloat(unitCost) : null,
        unit_price: unitPrice ? parseFloat(unitPrice) : null,
        setup_price: parseFloat(setupPrice) || 0,
        unit: unit || null,
        manufacturer: manufacturer || null,
        manufacturer_part_no: manufacturerPartNo || null,
        supplier_name: supplierName || null,
        supplier_sku: supplierSku || null,
        is_taxable: isTaxable,
        is_price_overrideable: isPriceOverrideable,
        is_active: isActive,
      };

      let product_id = product?.id;

      if (product_id) {
        const { error: e } = await db.from("products").update(payload).eq("id", product_id);
        if (e) throw e;
      } else {
        // tenant_id is required on insert (RLS WITH CHECK + NOT NULL column).
        if (!tenantId) { setError("Still loading — try again in a moment."); setSaving(false); return; }
        const { data, error: e } = await db
          .from("products")
          .insert({ ...payload, tenant_id: tenantId, source: "manual" })
          .select("id")
          .single();
        if (e) throw e;
        product_id = (data as { id: string }).id;
      }

      // Save pricing tiers
      for (const tier of tiers) {
        const tierPayload = {
          product_id: product_id!,
          tier_name: tier.tier_name,
          description: tier.description,
          unit_cost: tier.unit_cost,
          unit_price: tier.unit_price,
          is_default: tier.is_default,
          sort_order: tier.sort_order,
        };

        if (tier.id) {
          await db.from("product_pricing_tiers").update(tierPayload).eq("id", tier.id);
        } else {
          await db.from("product_pricing_tiers").insert(tierPayload);
        }
      }

      toast.success(product ? `${name.trim()} updated` : `${name.trim()} added to catalog`);
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function addTier() {
    scrollToNewTier.current = true;
    setTiers((prev) => [
      ...prev,
      { _uid: newUid(), tier_name: "", description: null, unit_cost: null, unit_price: null, is_default: false, sort_order: prev.length },
    ]);
  }

  // After a tier is appended, bring it into view + focus its name input.
  useEffect(() => {
    if (!scrollToNewTier.current) return;
    scrollToNewTier.current = false;
    const el = tiersEndRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector("input")?.focus();
  }, [tiers.length]);

  async function deleteTier(index: number) {
    const tier = tiers[index];
    if (tier.id) {
      await db.from("product_pricing_tiers").delete().eq("id", tier.id);
    }
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-background border-l shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">
            {readOnly ? "Product Details" : product ? "Edit Product" : "Add Product"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (fieldset natively disables all nested controls in view-only mode) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
        <fieldset disabled={readOnly} className="space-y-6 block min-w-0 border-0 m-0 p-0">
          {error && (
            <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
          )}

          {/* Basic info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-sm font-medium">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Category</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Item Type</label>
                <select value={itemType} onChange={(e) => setItemType(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— None —</option>
                  {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Billing Period</label>
                <select value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— None —</option>
                  {BILLING_PERIODS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Unit label</label>
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. /user/month"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-wrap gap-6 pt-1">
              {[
                { label: "Taxable", value: isTaxable, set: setIsTaxable },
                { label: "Price overrideable", value: isPriceOverrideable, set: setIsPriceOverrideable },
                { label: "Active", value: isActive, set: setIsActive },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)}
                    className="rounded border" />
                  {label}
                </label>
              ))}
            </div>
          </section>

          {/* Pricing tiers */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pricing Tiers</h3>
              <button type="button" onClick={addTier}
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Add tier
              </button>
            </div>
            {tiers.map((tier, i) => (
              <div
                key={tier._uid ?? i}
                ref={i === tiers.length - 1 ? tiersEndRef : undefined}
                className="rounded-lg border p-4 space-y-3 bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={tier.tier_name}
                    onChange={(e) => setTiers((prev) => prev.map((t, j) => j === i ? { ...t, tier_name: e.target.value } : t))}
                    placeholder="Tier name"
                    className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={tier.is_default}
                      onChange={(e) => setTiers((prev) => prev.map((t, j) =>
                        j === i ? { ...t, is_default: true } : { ...t, is_default: false }
                      ))}
                    />
                    Default
                  </label>
                  {tiers.length > 1 && (
                    <button type="button" onClick={() => deleteTier(i)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Cost Price</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={tier.unit_cost ?? ""}
                      onChange={(e) => setTiers((prev) => prev.map((t, j) => j === i ? { ...t, unit_cost: parseFloat(e.target.value) || null } : t))}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sell Price</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={tier.unit_price ?? ""}
                      onChange={(e) => setTiers((prev) => prev.map((t, j) => j === i ? { ...t, unit_price: parseFloat(e.target.value) || null } : t))}
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Tier Description</label>
                  <input
                    value={tier.description ?? ""}
                    onChange={(e) => setTiers((prev) => prev.map((t, j) => j === i ? { ...t, description: e.target.value || null } : t))}
                    placeholder="Optional"
                    className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            ))}
          </section>

          {/* Supplier / manufacturer */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Supplier & Manufacturer</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Manufacturer",       value: manufacturer,        set: setManufacturer },
                { label: "Manufacturer Part #", value: manufacturerPartNo, set: setManufacturerPartNo },
                { label: "Supplier Name",       value: supplierName,       set: setSupplierName },
                { label: "Supplier SKU",        value: supplierSku,        set: setSupplierSku },
              ].map(({ label, value, set }) => (
                <div key={label} className="space-y-1">
                  <label className="text-sm font-medium">{label}</label>
                  <input value={value} onChange={(e) => set(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
            </div>
          </section>
        </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0">
          {readOnly && (
            <span className="mr-auto text-xs text-muted-foreground">
              View only — products are managed by the tenant owner.
            </span>
          )}
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : product ? "Save Changes" : "Create Product"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
