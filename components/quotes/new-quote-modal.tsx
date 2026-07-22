"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface ClientOption {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
}

export interface TemplateOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  clients: ClientOption[];
  /** Active templates for the "Start from" selector. */
  templates?: TemplateOption[];
  /** Pre-select a template (template-first flow from /templates). */
  initialTemplateId?: string;
  onClose: () => void;
  onCreated: (quoteId: string) => void;
}

export function NewQuoteModal({ open, clients, templates = [], initialTemplateId, onClose, onCreated }: Props) {
  const toast = useToast();

  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [validDays, setValidDays] = useState("30");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adopt the preselected template each time the modal opens.
  useEffect(() => {
    if (open) setTemplateId(initialTemplateId ?? "");
  }, [open, initialTemplateId]);

  async function handleCreate() {
    if (!clientId) { setError("Please select a client"); return; }
    setSaving(true);
    setError(null);

    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + parseInt(validDays || "30"));

      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id:   clientId,
          title:       title || null,
          valid_until: validUntil.toISOString().split("T")[0],
          template_id: templateId || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error ?? "Failed to create proposal");

      toast.success("Proposal created — opening editor…");
      onCreated(json.id);
    } catch (e: unknown) {
      let msg = (e as { message?: string })?.message ?? "Failed to create proposal";
      // Browsers throw a raw "Failed to fetch" on network errors — make it clear.
      if (/failed to fetch/i.test(msg)) msg = "Network error — please check your connection and try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setClientId(""); setTitle(""); setValidDays("30"); setTemplateId(""); setError(null);
    onClose();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
        <div className="bg-background rounded-xl border shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-semibold">New Proposal</h2>
            <button onClick={handleClose} className="p-1 rounded hover:bg-muted">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Client *</label>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No active clients — add a client first.
                </p>
              ) : (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}{c.contact_name ? ` — ${c.contact_name}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {templates.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Start from</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Blank document</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  The template&apos;s document becomes this proposal&apos;s starting point.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">Proposal Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Managed Services Proposal"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Valid for (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={validDays}
                onChange={(e) => setValidDays(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
            <button
              onClick={handleClose}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !clientId}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating…" : "Create Proposal"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
