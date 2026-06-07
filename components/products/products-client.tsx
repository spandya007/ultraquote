"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Upload, Plus, ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";
import type { ProductCategory } from "@/types";
import { ProductDrawer } from "./product-drawer";

// Supabase join returns nested objects — match that shape here
interface PricingTier {
  id: string;
  product_id: string;
  tier_name: string;
  description: string | null;
  unit_cost: number | null;
  unit_price: number | null;
  is_default: boolean;
  sort_order: number;
}

interface ProductRow {
  id: string;
  tenant_id: string;
  zomentum_id: string | null;
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
  created_at: string;
  category: { id: string; name: string } | null;
  pricing_tiers: PricingTier[];
}

interface Props {
  initialProducts: ProductRow[];
  categories: ProductCategory[];
}

export function ProductsClient({ initialProducts, categories }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("active");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Derived filter values
  const itemTypes = useMemo(() => {
    const types = new Set(products.map((p) => p.item_type).filter(Boolean));
    return Array.from(types) as string[];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (filterActive === "active" && !p.is_active) return false;
      if (filterActive === "inactive" && p.is_active) return false;
      if (filterCategory !== "all" && p.category?.id !== filterCategory) return false;
      if (filterType !== "all" && p.item_type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q) ||
          (p.manufacturer ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, search, filterCategory, filterType, filterActive]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/products/import", { method: "POST", body: form });
      const data = await res.json();
      setImportResult(data);
      if (data.imported > 0) {
        router.refresh();
      }
    } catch {
      setImportResult({ imported: 0, skipped: 0, errors: ["Network error during import"] });
    } finally {
      setImporting(false);
      // Reset file input
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openDrawer(product: ProductRow | null) {
    setSelectedProduct(product);
    setDrawerOpen(true);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} of {products.length} products
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <button
            onClick={() => openDrawer(null)}
            className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={cn(
          "rounded-md px-4 py-3 text-sm mb-4 flex items-start justify-between gap-4",
          importResult.errors.length > 0 ? "bg-yellow-50 text-yellow-800" : "bg-green-50 text-green-800"
        )}>
          <div>
            <p className="font-medium">
              Import complete — {importResult.imported} imported, {importResult.skipped} skipped
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Types</option>
          {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Active filter */}
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Billing</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cost</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margin</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Tiers</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  {products.length === 0
                    ? "No products yet — import your CSV to get started."
                    : "No products match your filters."}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const defaultTier = p.pricing_tiers.find((t) => t.is_default) ?? p.pricing_tiers[0];
                const cost = defaultTier?.unit_cost ?? p.unit_cost;
                const price = defaultTier?.unit_price ?? p.unit_price;
                const margin =
                  price && cost && price > 0
                    ? (((price - cost) / price) * 100).toFixed(1)
                    : null;

                return (
                  <tr
                    key={p.id}
                    onClick={() => openDrawer(p)}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium truncate max-w-xs">{p.name}</p>
                      {p.manufacturer && (
                        <p className="text-xs text-muted-foreground">{p.manufacturer}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.category?.name ?? <span className="italic">Uncategorised</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.item_type && (
                        <span className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          p.item_type === "Service"  && "bg-blue-100 text-blue-700",
                          p.item_type === "Hardware" && "bg-orange-100 text-orange-700",
                          p.item_type === "Software" && "bg-purple-100 text-purple-700",
                          p.item_type === "Other"    && "bg-gray-100 text-gray-600",
                        )}>
                          {p.item_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.billing_period ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {margin ? (
                        <span className={cn(
                          parseFloat(margin) >= 30 ? "text-green-600" :
                          parseFloat(margin) >= 15 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {margin}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.pricing_tiers.length > 1 ? (
                        <span className="text-xs bg-muted rounded-full px-2 py-0.5">
                          {p.pricing_tiers.length}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.is_active
                        ? <Check className="w-4 h-4 text-green-500 mx-auto" />
                        : <X className="w-4 h-4 text-muted-foreground mx-auto" />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Product edit drawer */}
      <ProductDrawer
        open={drawerOpen}
        product={selectedProduct}
        categories={categories}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); router.refresh(); }}
      />
    </>
  );
}
