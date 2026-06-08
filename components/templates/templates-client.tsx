"use client";

import { useState } from "react";
import { BookTemplate, Trash2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export function TemplatesClient({ initialTemplates }: { initialTemplates: TemplateRow[] }) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const toast = useToast();

  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function rename(id: string, name: string) {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, name } : t));
    const { error } = await db.from("templates").update({ name }).eq("id", id);
    if (error) toast.error("Failed to rename template");
  }
  async function updateDescription(id: string, description: string) {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, description } : t));
    const { error } = await db.from("templates").update({ description: description || null }).eq("id", id);
    if (error) toast.error("Failed to save description");
  }
  async function remove(id: string) {
    setConfirmId(null);
    const { error } = await db.from("templates").update({ is_active: false }).eq("id", id);
    if (error) { toast.error("Failed to delete template"); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success("Template deleted");
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reusable proposal documents you can apply to any quote.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <BookTemplate className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No templates yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create one from a quote: open its <strong>Document</strong> tab →
            <strong> Templates → Save as template</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <input
                    value={t.name}
                    onChange={(e) => rename(t.id, e.target.value)}
                    className="w-full font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
                  />
                  <textarea
                    value={t.description ?? ""}
                    onChange={(e) => updateDescription(t.id, e.target.value)}
                    placeholder="Add a description…"
                    rows={2}
                    className="w-full text-sm text-muted-foreground bg-transparent border-none outline-none focus:ring-0 p-0 mt-1 resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2">Created {formatDate(t.created_at)}</p>
                </div>
                {confirmId === t.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => remove(t.id)} className="rounded border border-destructive text-destructive px-2 py-1 text-xs hover:bg-destructive/10">Delete</button>
                    <button onClick={() => setConfirmId(null)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(t.id)}
                    title="Delete template"
                    className={cn("p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors shrink-0")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
