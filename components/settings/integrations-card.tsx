"use client";

import { Plug, Lock, CheckCircle2 } from "lucide-react";
import { PROVIDERS, CATEGORY_LABELS, type ProviderKey } from "@/lib/integrations/providers";
import type { IntegrationConnection } from "@/lib/integrations/store";

// Settings → Integrations. Gated by the 'integrations' entitlement (resolved
// server-side and passed as `enabled`). Non-entitled tenants see a locked
// upgrade state. See docs/integrations-phase-a-plan.md (A2).
export function IntegrationsCard({
  enabled,
  planName,
  connections,
}: {
  enabled: boolean;
  planName: string;
  connections: IntegrationConnection[];
}) {
  const byProvider = new Map<ProviderKey, IntegrationConnection>(
    connections.map((c) => [c.provider, c])
  );

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
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {conn?.account_ref ? `#${conn.account_ref}` : "Connected"}
                      </span>
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
