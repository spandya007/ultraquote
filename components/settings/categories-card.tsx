"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

interface Category { id: string; name: string; sort_order: number }

// Owner-only manager for the tenant's product categories. Categories are an
// internal catalog taxonomy (filtering/grouping) — they never appear on
// client-facing proposals, so edits are low-stakes. Deleting a category sets its
// products to Uncategorised (FK on delete set null); no products are deleted.
export function CategoriesCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db
      .from("product_categories")
      .select("id, name, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order")
      .order("name");
    setCats((data as Category[]) ?? []);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  async function addCategory() {
    const name = newName.trim();
    if (!name || busy) return;
    if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error("A category with that name already exists.");
      return;
    }
    setBusy(true);
    const nextOrder = cats.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;
    const { error } = await db.from("product_categories").insert({ tenant_id: tenantId, name, sort_order: nextOrder });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewName("");
    toast.success("Category added");
    load();
  }

  async function rename(cat: Category, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === cat.name) { load(); return; }
    const { error } = await db.from("product_categories").update({ name: trimmed }).eq("id", cat.id);
    if (error) { toast.error(error.message); load(); return; }
    toast.success("Renamed");
    load();
  }

  async function move(cat: Category, dir: -1 | 1) {
    const idx = cats.findIndex((c) => c.id === cat.id);
    const swap = cats[idx + dir];
    if (!swap) return;
    // Swap sort_order with the neighbor.
    await db.from("product_categories").update({ sort_order: swap.sort_order }).eq("id", cat.id);
    await db.from("product_categories").update({ sort_order: cat.sort_order }).eq("id", swap.id);
    load();
  }

  async function remove(cat: Category) {
    const { count } = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", cat.id);
    const n = count ?? 0;
    const msg = n > 0
      ? `Delete the category "${cat.name}"? ${n} product${n === 1 ? "" : "s"} will become Uncategorised (the products are NOT deleted, and you can recategorize them anytime).`
      : `Delete the category "${cat.name}"?`;
    if (!window.confirm(msg)) return;
    const { error } = await db.from("product_categories").delete().eq("id", cat.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Category deleted");
    load();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Organize your product catalog into categories. These are for your internal grouping and filtering
        only — they don’t appear on client proposals. Deleting a category just makes its products
        “Uncategorised.”
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-1.5">
          {cats.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                defaultValue={c.name}
                onBlur={(e) => rename(c, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={() => move(c, -1)} disabled={i === 0} title="Move up"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={() => move(c, 1)} disabled={i === cats.length - 1} title="Move down"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30">
                <ChevronDown className="w-4 h-4" />
              </button>
              <button onClick={() => remove(c)} title="Delete category"
                className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-500/15">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {cats.length === 0 && (
            <p className="text-sm text-muted-foreground italic py-1">No categories yet.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
          placeholder="New category name…"
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={addCategory}
          disabled={busy || !newName.trim()}
          className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>
    </div>
  );
}
