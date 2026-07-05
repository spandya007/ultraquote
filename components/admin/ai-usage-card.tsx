import { Sparkles } from "lucide-react";

// Platform-Admin AI cost/usage overview (last 30 days), aggregated in app/admin/page.tsx
// from the ai_usage ledger. Pure display — no interactivity.

export interface AiUsageSummary {
  windowDays: number;
  totalCalls: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  byModel: { model: string; calls: number; costUsd: number }[];
  byKind: { kind: string; calls: number; costUsd: number }[];
  topTenants: { tenantId: string; name: string; calls: number; costUsd: number }[];
}

const usd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 4)}`;
const num = (n: number) => n.toLocaleString();
const KIND_LABEL: Record<string, string> = {
  draft_section: "Draft (section)",
  draft_full: "Draft (full)",
  draft_outline: "Outline",
  write: "Ask AI",
  extract_pricing: "Extract pricing",
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function AiUsageCard({ summary: s }: { summary: AiUsageSummary }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold">AI usage &amp; cost</h2>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">last {s.windowDays} days</span>
      </div>

      {s.totalCalls === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
          No AI usage recorded yet. (If AI features are in use, confirm migration 024 has been applied.)
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total cost" value={usd(s.totalCostUsd)} sub="estimate (snapshot rates)" />
            <Stat label="AI calls" value={num(s.totalCalls)} />
            <Stat label="Tokens in / out" value={`${num(s.totalInputTokens)} / ${num(s.totalOutputTokens)}`} />
            <Stat label="Cache reads" value={num(s.totalCacheReadTokens)} sub="prompt-cache savings" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b text-sm font-medium">By model</div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {s.byModel.map((m) => (
                    <tr key={m.model}>
                      <td className="px-4 py-2 font-mono text-xs">{m.model}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{num(m.calls)} calls</td>
                      <td className="px-4 py-2 text-right font-medium">{usd(m.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b text-sm font-medium">By type</div>
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {s.byKind.map((k) => (
                    <tr key={k.kind}>
                      <td className="px-4 py-2">{KIND_LABEL[k.kind] ?? k.kind}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{num(k.calls)} calls</td>
                      <td className="px-4 py-2 text-right font-medium">{usd(k.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b text-sm font-medium">Top workspaces by cost</div>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Workspace</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Calls</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.topTenants.map((t) => (
                  <tr key={t.tenantId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{num(t.calls)}</td>
                    <td className="px-4 py-2 text-right font-medium">{usd(t.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Cost is a snapshot estimate from published token rates at the time of each call. Tokens are the source of truth.
          </p>
        </div>
      )}
    </section>
  );
}
