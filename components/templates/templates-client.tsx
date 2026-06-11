"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookTemplate, Trash2, FileText, PenLine, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { NewQuoteModal } from "@/components/quotes/new-quote-modal";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
  creator: { full_name: string | null; email: string } | null;
}

interface ClientOption {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
}

interface Props {
  initialTemplates: TemplateRow[];
  currentUserId: string;
  /** Tenant owner may edit any template; others only their own. */
  isOwner: boolean;
  /** Active clients — for the "New quote from this template" modal. */
  clients: ClientOption[];
}

export function TemplatesClient({ initialTemplates, currentUserId, isOwner, clients }: Props) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const toast = useToast();

  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Template-first flow: open the New Quote modal with this template preselected.
  const [quoteFromTemplateId, setQuoteFromTemplateId] = useState<string | null>(null);

  // Pull the latest server data when this page is shown (bypasses the App Router
  // client cache so a just-created template appears immediately)…
  useEffect(() => { router.refresh(); }, [router]);
  // …and adopt the refreshed server data into local state.
  useEffect(() => { setTemplates(initialTemplates); }, [initialTemplates]);

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
          {templates.map(t => {
            // Templates are usable by everyone, editable by creator + owner.
            const canEdit = isOwner || t.created_by === currentUserId;
            const creatorLabel = t.creator?.full_name || t.creator?.email || null;
            return (
            <div key={t.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <input
                    value={t.name}
                    onChange={(e) => rename(t.id, e.target.value)}
                    disabled={!canEdit}
                    className="w-full font-semibold bg-transparent border-none outline-none focus:ring-0 p-0 disabled:opacity-100"
                  />
                  <textarea
                    value={t.description ?? ""}
                    onChange={(e) => updateDescription(t.id, e.target.value)}
                    placeholder={canEdit ? "Add a description…" : ""}
                    rows={2}
                    disabled={!canEdit}
                    className="w-full text-sm text-muted-foreground bg-transparent border-none outline-none focus:ring-0 p-0 mt-1 resize-none"
                  />
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(t.created_at)}
                      {creatorLabel && <> by {creatorLabel}</>}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setQuoteFromTemplateId(t.id)}
                        title="Create a new quote that starts from this template's document"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> New quote
                      </button>
                      <Link
                        href={`/templates/${t.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        {canEdit ? <PenLine className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        {canEdit ? "Edit" : "View"}
                      </Link>
                    </div>
                  </div>
                </div>
                {canEdit && (confirmId === t.id ? (
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
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <NewQuoteModal
        open={quoteFromTemplateId !== null}
        clients={clients}
        templates={templates.map(t => ({ id: t.id, name: t.name }))}
        initialTemplateId={quoteFromTemplateId ?? undefined}
        onClose={() => setQuoteFromTemplateId(null)}
        onCreated={(id) => { setQuoteFromTemplateId(null); router.push(`/quotes/${id}`); }}
      />
    </>
  );
}
