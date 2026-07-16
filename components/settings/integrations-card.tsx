"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PROVIDERS, CATEGORY_LABELS, type ProviderKey } from "@/lib/integrations/providers";
import type { IntegrationConnection } from "@/lib/integrations/store";

// Maps a ?integration=<code> return param to a user-facing message.
const RETURN_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  qbo_connected: { ok: true, text: "QuickBooks Online connected." },
  qbo_error: { ok: false, text: "Couldn't connect QuickBooks. Please try again." },
  qbo_state_error: { ok: false, text: "Connection expired — please try connecting again." },
  qbo_unconfigured: { ok: false, text: "QuickBooks isn't configured yet. Contact support." },
  not_entitled: { ok: false, text: "Integrations aren't included in your current plan." },
  forbidden: { ok: false, text: "Only the account owner can manage integrations." },
};

// Settings → Integrations. Gated by the 'integrations' entitlement (resolved
// server-side and passed as `enabled`). Non-entitled tenants see a locked
// upgrade state. See docs/integrations-phase-a-plan.md (A2).
export function IntegrationsCard({
  enabled,
  planName,
  connections,
  returnCode,
}: {
  enabled: boolean;
  planName: string;
  connections: IntegrationConnection[];
  returnCode?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [disconnecting, setDisconnecting] = useState<ProviderKey | null>(null);

  const byProvider = new Map<ProviderKey, IntegrationConnection>(
    connections.map((c) => [c.provider, c])
  );

  // Show a toast for the OAuth return, then strip the query param.
  useEffect(() => {
    if (!returnCode) return;
    const msg = RETURN_MESSAGES[returnCode];
    if (msg) (msg.ok ? toast.success : toast.error)(msg.text);
    router.replace("/settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnCode]);

  async function disconnect(provider: ProviderKey) {
    if (!window.confirm("Disconnect QuickBooks? New signed quotes will stop creating invoices.")) return;
    setDisconnecting(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Failed to disconnect");
        return;
      }
      toast.success("Disconnected");
      router.refresh();
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <Plug className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-base">Integrations</h2>
      </div>

      <div className="px-6 py-5">
        {!enabled ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
            <Lock className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">Integrations aren&apos;t included in your plan</p>
              <p className="text-muted-foreground mt-1">
                Connecting QuickBooks Online and other services is available on our subscription
                plans. Your current plan is <strong>{planName}</strong>. Contact us to upgrade.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Connect the cloud services you already use. More connectors are on the way.
            </p>
            <ul className="divide-y">
              {PROVIDERS.map((p) => {
                const conn = byProvider.get(p.key);
                const connected = conn?.status === "connected";
                return (
                  <li key={p.key} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <ProviderLogo
                      src={p.logoSrc}
                      monogram={p.monogram ?? p.label.charAt(0)}
                      color={p.brandColor ?? "#64748b"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-[10px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {CATEGORY_LABELS[p.category]}
                        </span>
                        {connected && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                    {p.status === "coming_soon" ? (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">Coming soon</span>
                    ) : connected ? (
                      <button
                        type="button"
                        onClick={() => disconnect(p.key)}
                        disabled={disconnecting === p.key}
                        className="inline-flex items-center gap-2 shrink-0 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {disconnecting === p.key && <Loader2 className="w-4 h-4 animate-spin" />} Disconnect
                      </button>
                    ) : (
                      <a
                        href={`/api/integrations/${p.key}/connect`}
                        className="shrink-0 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
                      >
                        Connect
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// Renders the vendor's official logo (from /public) when present, else a
// brand-coloured monogram badge. The <img> falls back to the monogram on load
// error, so a missing asset never shows a broken image.
function ProviderLogo({ src, monogram, color }: { src?: string; monogram: string; color: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        className="w-9 h-9 rounded-md object-contain shrink-0"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold lowercase text-white"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {monogram}
    </div>
  );
}
