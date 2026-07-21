import { Target } from "lucide-react";
import type { QuoteStatus } from "@/types";

// Platform-Admin AI *measurement* view: joins the ai_usage draft ledger to each
// quote's current status to replace the GUESSED inputs in the pricing model
// (docs/pricing-model-design.md §13) with real data — the actual draft:sign
// ratio and AI-cost-per-signed-doc. Aggregated in app/admin/page.tsx. Pure display.

export interface AiMeasurementSummary {
  windowDays: number;
  draftedQuotes: number;       // distinct quotes that had ≥1 draft_* call in the window
  totalDraftCalls: number;     // draft_* calls across those quotes (in the window)
  totalDraftCostUsd: number;   // draft_* cost across those quotes (in the window)
  // Current-status breakdown of the drafted proposals (effective status; expired derived).
  byStatus: { status: QuoteStatus; quotes: number; draftCalls: number; costUsd: number }[];
  signedQuotes: number;        // current status === 'signed'
  sentQuotes: number;          // ever left draft (sent/viewed/signed/declined/expired)
  openQuotes: number;          // still 'draft'
  // Ratios / unit costs — null when the denominator is 0 (not enough data yet).
  draftPerSign: number | null;       // drafted proposals per signed doc (the win-rate lever in §13.1)
  draftPerSent: number | null;
  costPerSignedDoc: number | null;   // = costPerDraftedQuote × draftPerSign
  costPerDraftedQuote: number | null;
  callsPerDraftedQuote: number | null;
}

const usd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 4)}`;
const num = (n: number) => n.toLocaleString();
const ratio = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}×`);
const oneDp = (n: number | null) => (n === null ? "—" : n.toFixed(1));

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Draft (open)",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
};
const STATUS_DOT: Record<QuoteStatus, string> = {
  draft: "bg-gray-400",
  sent: "bg-blue-500",
  viewed: "bg-purple-500",
  signed: "bg-green-500",
  declined: "bg-red-500",
  expired: "bg-orange-500",
};

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-primary/5 border-primary/20" : "bg-card"}`}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function AiMeasurementCard({ summary: s }: { summary: AiMeasurementSummary }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold">AI cost per signed doc</h2>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">last {s.windowDays} days</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Real draft:sign ratio &amp; AI cost per outcome, from the usage ledger joined to quote status. Replaces the
        guessed inputs in the pricing model.
      </p>

      {s.draftedQuotes === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
          No AI-drafted proposals recorded yet. (Populates once quotes use AI Draft; confirm migrations 024–026 are applied.)
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="AI cost / signed doc"
              value={s.costPerSignedDoc === null ? "—" : usd(s.costPerSignedDoc)}
              sub={s.signedQuotes === 0 ? "no signed docs yet" : `${num(s.signedQuotes)} signed`}
              accent
            />
            <Stat label="Draft : sign ratio" value={ratio(s.draftPerSign)} sub="drafted proposals per signed doc" />
            <Stat label="AI cost / drafted quote" value={s.costPerDraftedQuote === null ? "—" : usd(s.costPerDraftedQuote)} sub={`${oneDp(s.callsPerDraftedQuote)} calls avg`} />
            <Stat label="AI-drafted proposals" value={num(s.draftedQuotes)} sub={`${num(s.totalDraftCalls)} draft calls · ${usd(s.totalDraftCostUsd)}`} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b text-sm font-medium">Drafted quotes by current status</div>
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Proposals</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Draft calls</th>
                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">AI cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {s.byStatus.map((b) => (
                    <tr key={b.status}>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[b.status]}`} />
                          {STATUS_LABEL[b.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">{num(b.quotes)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{num(b.draftCalls)}</td>
                      <td className="px-4 py-2 text-right font-medium">{usd(b.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border bg-card p-4 text-sm space-y-2">
              <div className="font-medium mb-1">How to read this</div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                <strong className="text-foreground">AI cost per signed doc</strong> = AI cost per drafted quote ×
                draft:sign ratio. It's the true AI cost against revenue, since we bill on <em>signed</em> docs but
                spend on every <em>drafted</em> one. Compare it to the per-signed-doc cost budget (pricing §12) to
                confirm the per-quote AI cap keeps margin healthy.
              </p>
              <ul className="text-muted-foreground text-xs space-y-1 mt-2">
                <li>• <strong className="text-foreground">Sent-out:</strong> {num(s.sentQuotes)} of {num(s.draftedQuotes)} drafted proposals left draft{s.draftPerSent !== null ? ` (${ratio(s.draftPerSent)} draft:sent).` : "."}</li>
                <li>• <strong className="text-foreground">Still open:</strong> {num(s.openQuotes)} drafted proposals never sent — their AI spend has earned nothing yet.</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Window = quotes with AI draft activity in the last {s.windowDays} days, bucketed by their current status
            (which may have changed since). Cost is the snapshot estimate from the ledger.
          </p>
        </div>
      )}
    </section>
  );
}
