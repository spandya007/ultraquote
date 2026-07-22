"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Webhook, Loader2, Plus, Trash2, KeyRound, Copy, Check, Activity, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type WebhookEventType } from "@/lib/webhooks/events";
import type { WebhookSummary, DeliverySummary } from "@/lib/webhooks/store";

// Settings → Integrations → Webhooks. Owner-only, gated by 'integrations'
// (parent renders it only when entitled). Send SmartProps proposal events to any
// HTTPS endpoint (your own service, Zapier, Make). Signing secrets are shown once.
// docs/integrations-phase-c-api-webhooks-zapier.md §2.5.
export function WebhooksCard({ webhooks }: { webhooks: WebhookSummary[] }) {
  const router = useRouter();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<WebhookEventType>>(new Set(WEBHOOK_EVENTS));
  const [busy, setBusy] = useState<string | null>(null); // webhook id or "new"
  const [secretModal, setSecretModal] = useState<{ secret: string; url?: string } | null>(null);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliverySummary[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const toggleEvent = (e: WebhookEventType) =>
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e); else next.add(e);
      return next;
    });

  async function create() {
    if (events.size === 0) return toast.error("Select at least one event.");
    setBusy("new");
    try {
      const res = await fetch("/api/webhooks/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events: [...events] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(j.error || "Couldn't add endpoint");
      setSecretModal({ secret: j.secret, url });
      setAdding(false);
      setUrl("");
      setEvents(new Set(WEBHOOK_EVENTS));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggle(w: WebhookSummary) {
    setBusy(w.id);
    try {
      const res = await fetch(`/api/webhooks/endpoints/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !w.enabled }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); return toast.error(j.error || "Failed"); }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(w: WebhookSummary) {
    if (!window.confirm("Regenerate the signing secret? The current secret stops working immediately.")) return;
    setBusy(w.id);
    try {
      const res = await fetch(`/api/webhooks/endpoints/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(j.error || "Failed");
      setSecretModal({ secret: j.secret, url: w.url });
    } finally {
      setBusy(null);
    }
  }

  async function remove(w: WebhookSummary) {
    if (!window.confirm(`Delete this endpoint? SmartProps will stop sending events to ${w.url}.`)) return;
    setBusy(w.id);
    try {
      const res = await fetch(`/api/webhooks/endpoints/${w.id}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); return toast.error(j.error || "Failed"); }
      if (openDeliveries === w.id) setOpenDeliveries(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function loadDeliveries(w: WebhookSummary) {
    if (openDeliveries === w.id) { setOpenDeliveries(null); return; }
    setOpenDeliveries(w.id);
    setLoadingDeliveries(true);
    try {
      const res = await fetch(`/api/webhooks/endpoints/${w.id}/deliveries`);
      const j = await res.json().catch(() => ({}));
      setDeliveries(res.ok ? (j.deliveries ?? []) : []);
    } finally {
      setLoadingDeliveries(false);
    }
  }

  async function resend(d: DeliverySummary, w: WebhookSummary) {
    setBusy(d.id);
    try {
      const res = await fetch(`/api/webhooks/deliveries/${d.id}/resend`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) toast.success("Delivered"); else toast.error("Resend failed");
      await loadDeliveriesRefresh(w);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  // Refetch without toggling the open panel.
  async function loadDeliveriesRefresh(w: WebhookSummary) {
    const res = await fetch(`/api/webhooks/endpoints/${w.id}/deliveries`);
    const j = await res.json().catch(() => ({}));
    if (res.ok) setDeliveries(j.deliveries ?? []);
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm mt-6">
      <div className="flex items-center justify-between gap-2.5 px-6 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <Webhook className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-base">Webhooks</h2>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Plus className="w-4 h-4" /> Add endpoint
          </button>
        )}
      </div>

      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground mb-4">
          Send proposal events (sent, viewed, signed, declined) to any HTTPS endpoint — your own
          service, Zapier, or Make. Each request is signed so you can verify it came from SmartProps.
        </p>

        {adding && (
          <div className="rounded-lg border p-4 mb-4 space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Endpoint URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/webhooks/smartprops"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <span className="block text-xs font-medium mb-1.5">Events</span>
              <div className="grid grid-cols-2 gap-1.5">
                {WEBHOOK_EVENTS.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={events.has(e)} onChange={() => toggleEvent(e)} />
                    {WEBHOOK_EVENT_LABELS[e]}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setAdding(false); setUrl(""); }} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
                Cancel
              </button>
              <button
                type="button"
                onClick={create}
                disabled={busy === "new" || !url.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === "new" && <Loader2 className="w-4 h-4 animate-spin" />} Add endpoint
              </button>
            </div>
          </div>
        )}

        {webhooks.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No endpoints yet.</p>
        ) : (
          <ul className="divide-y">
            {webhooks.map((w) => (
              <li key={w.id} className="py-3 first:pt-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm break-all">{w.url}</span>
                      {w.enabled ? (
                        <span className="text-[10px] uppercase tracking-wide rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5">Enabled</span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide rounded bg-muted text-muted-foreground px-1.5 py-0.5">Disabled</span>
                      )}
                      {w.source !== "user" && (
                        <span className="text-[10px] uppercase tracking-wide rounded bg-muted text-muted-foreground px-1.5 py-0.5">{w.source}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {w.events.length === 0 ? "All events" : w.events.map((e) => WEBHOOK_EVENT_LABELS[e as WebhookEventType] ?? e).join(", ")}
                      {w.last_status && <> · last: <span className={w.last_status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{w.last_status}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" title="Recent deliveries" onClick={() => loadDeliveries(w)} className="p-1.5 rounded-md hover:bg-muted"><Activity className="w-4 h-4" /></button>
                    <button type="button" title="Regenerate secret" onClick={() => regenerate(w)} disabled={busy === w.id} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-50"><KeyRound className="w-4 h-4" /></button>
                    <button type="button" onClick={() => toggle(w)} disabled={busy === w.id} className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
                      {w.enabled ? "Disable" : "Enable"}
                    </button>
                    <button type="button" title="Delete" onClick={() => remove(w)} disabled={busy === w.id} className="p-1.5 rounded-md hover:bg-muted text-red-600 dark:text-red-400 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>

                {openDeliveries === w.id && (
                  <div className="mt-3 rounded-lg border bg-muted/40 p-3">
                    {loadingDeliveries ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                    ) : deliveries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No deliveries yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {deliveries.map((d) => (
                          <li key={d.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="flex items-center gap-2 min-w-0">
                              <DeliveryDot status={d.status} />
                              <span className="font-medium">{d.event_type}</span>
                              <span className="text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                              {d.response_code != null && <span className="text-muted-foreground">· {d.response_code}</span>}
                              {d.attempts > 1 && <span className="text-muted-foreground">· {d.attempts} tries</span>}
                            </span>
                            <button type="button" onClick={() => resend(d, w)} disabled={busy === d.id} className="rounded border px-2 py-0.5 hover:bg-background disabled:opacity-50 shrink-0">Resend</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {secretModal && <SecretModal secret={secretModal.secret} url={secretModal.url} onClose={() => setSecretModal(null)} />}
    </div>
  );
}

function DeliveryDot({ status }: { status: string }) {
  const color =
    status === "success" ? "bg-emerald-500" :
    status === "dead" ? "bg-red-500" :
    status === "failed" ? "bg-amber-500" : "bg-slate-400";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} title={status} />;
}

function SecretModal({ secret, url, onClose }: { secret: string; url?: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Signing secret</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Copy this now — it&apos;s shown <strong>only once</strong>. Use it to verify the
          <code className="text-xs mx-1">X-SmartProps-Signature</code> header on requests
          {url ? <> to <span className="font-mono break-all">{url}</span></> : null}.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
          <code className="text-xs break-all flex-1">{secret}</code>
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
