"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Plus, Trash2, Copy, Check, X, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { ApiKeySummary } from "@/lib/api/keys";

// Settings → Integrations → API keys. Owner-only, gated by 'integrations' (parent
// renders it only when entitled). Keys are shown once at creation.
// docs/integrations-phase-c-api-webhooks-zapier.md §3.5.
export function ApiKeysCard({ keys }: { keys: ApiKeySummary[] }) {
  const router = useRouter();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return toast.error("Give the key a name.");
    setBusy("new");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, write }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(j.error || "Couldn't create key");
      setReveal(j.key);
      setAdding(false);
      setName("");
      setWrite(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function revoke(k: ApiKeySummary) {
    if (!window.confirm(`Revoke "${k.name}"? Any integration using it stops working immediately.`)) return;
    setBusy(k.id);
    try {
      const res = await fetch(`/api/keys/${k.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); return toast.error(j.error || "Failed"); }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = keys.filter((k) => !k.revoked_at);

  return (
    <div className="rounded-xl border bg-card shadow-sm mt-6">
      <div className="flex items-center justify-between gap-2.5 px-6 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-base">API keys</h2>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Plus className="w-4 h-4" /> New key
          </button>
        )}
      </div>

      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground mb-4">
          Programmatic access to your proposals, clients, and catalog.{" "}
          <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            API reference <ExternalLink className="w-3 h-3" />
          </a>
        </p>

        {adding && (
          <div className="rounded-lg border p-4 mb-4 space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Key name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zapier, internal script, …" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
              Allow writes (create clients, manage webhook subscriptions)
            </label>
            <p className="text-xs text-muted-foreground">Read access is always included. Leave unchecked for a read-only key.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setAdding(false); setName(""); setWrite(false); }} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
              <button type="button" onClick={create} disabled={busy === "new" || !name.trim()} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy === "new" && <Loader2 className="w-4 h-4 animate-spin" />} Create key
              </button>
            </div>
          </div>
        )}

        {active.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="divide-y">
            {active.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{k.name}</span>
                    <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                    {k.scopes.includes("write")
                      ? <span className="text-[10px] uppercase tracking-wide rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5">read/write</span>
                      : <span className="text-[10px] uppercase tracking-wide rounded bg-muted text-muted-foreground px-1.5 py-0.5">read-only</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}
                    {" · "}Created {new Date(k.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button type="button" title="Revoke" onClick={() => revoke(k)} disabled={busy === k.id} className="p-1.5 rounded-md hover:bg-muted text-red-600 dark:text-red-400 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reveal && <RevealModal keyValue={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function RevealModal({ keyValue, onClose }: { keyValue: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(keyValue); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Your new API key</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Copy it now — it&apos;s shown <strong>only once</strong>. Send it as
          <code className="text-xs mx-1">Authorization: Bearer &lt;key&gt;</code>.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
          <code className="text-xs break-all flex-1">{keyValue}</code>
          <button onClick={copy} className="p-1.5 rounded hover:bg-background shrink-0" title="Copy">
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Done</button>
        </div>
      </div>
    </div>
  );
}
