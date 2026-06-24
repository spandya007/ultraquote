"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DollarSign, Repeat, CheckCircle2, Trophy, Users, FileText, Clock, ArrowRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { QuoteStatus } from "@/types";
import { STATUS_STYLES, effectiveStatus } from "@/lib/quote-status";

export interface Scenario { is_recommended: boolean; sort_order: number; monthly_recurring_total: number; onetime_total: number; total: number }
export interface QuoteRow {
  id: string; quote_number: string; title: string | null; status: QuoteStatus;
  valid_until: string | null; created_at: string; updated_at: string | null;
  client: { company_name: string } | null;
  scenarios: Scenario[];
}

const OPEN_STATUSES: QuoteStatus[] = ["draft", "sent", "viewed"];
const STATUSES: QuoteStatus[] = ["draft", "sent", "viewed", "signed", "declined", "expired"];
const STATUS_BAR: Record<QuoteStatus, string> = {
  draft: "bg-gray-400", sent: "bg-blue-500", viewed: "bg-purple-500",
  signed: "bg-green-500", declined: "bg-red-500", expired: "bg-orange-500",
};
const DAY = 86_400_000;

function repScenario(q: QuoteRow): Scenario | null {
  const sorted = [...(q.scenarios ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.find((s) => s.is_recommended) ?? sorted[0] ?? null;
}
// Day index (UTC midnight ms) for a timestamp — the axis the range slider works on.
function dayMs(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function todayMs(): number {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}
function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function DashboardClient({ quotes, clientCount }: { quotes: QuoteRow[]; clientCount: number }) {
  // Timeline: earliest quote -> today. Offsets are whole days from minDay.
  const maxDay = todayMs();
  const minDay = useMemo(
    () => (quotes.length ? Math.min(...quotes.map((q) => dayMs(q.created_at))) : maxDay - 30 * DAY),
    [quotes, maxDay]
  );
  const totalDays = Math.max(1, Math.round((maxDay - minDay) / DAY));

  // Selected range as day-offsets [lo, hi]. Default = full range (all time).
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(totalDays);

  const startMs = minDay + lo * DAY;
  const endMs = minDay + hi * DAY;

  const inRange = useMemo(
    () => quotes.filter((q) => { const d = dayMs(q.created_at); return d >= startMs && d <= endMs; }),
    [quotes, startMs, endMs]
  );

  // ── Aggregates over the selected range ──────────────────────────────────────
  const open = inRange.filter((q) => OPEN_STATUSES.includes(effectiveStatus(q)));
  const signed = inRange.filter((q) => q.status === "signed");
  const pipeline = open.reduce((s, q) => s + (repScenario(q)?.total ?? 0), 0);
  const pipelineMrr = open.reduce((s, q) => s + (repScenario(q)?.monthly_recurring_total ?? 0), 0);
  const wonValue = signed.reduce((s, q) => s + (repScenario(q)?.total ?? 0), 0);
  const decided = inRange.filter((q) => q.status === "signed" || q.status === "declined").length;
  const winRate = decided > 0 ? Math.round((signed.length / decided) * 100) : null;

  const byStatus = STATUSES.map((st) => ({ status: st, count: inRange.filter((q) => effectiveStatus(q) === st).length }));
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));
  const recent = inRange.slice(0, 6);

  // Expiring soon is forward-looking (next 14 days) — NOT range-filtered.
  const now = Date.now();
  const expiring = quotes
    .filter((q) => OPEN_STATUSES.includes(q.status) && q.valid_until)
    .map((q) => ({ q, days: Math.ceil((new Date(q.valid_until as string).getTime() - now) / DAY) }))
    .filter((x) => x.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  const isAll = lo === 0 && hi === totalDays;
  function preset(days: number | "all") {
    setHi(totalDays);
    setLo(days === "all" ? 0 : Math.max(0, totalDays - days));
  }

  return (
    <div className="space-y-6">
      {/* Date-range control */}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-medium">Showing quotes created in this range</p>
            <p className="text-xs text-muted-foreground">
              {fmtDay(startMs)} – {fmtDay(endMs)} · {inRange.length} quote{inRange.length === 1 ? "" : "s"}
              {isAll ? " (all time)" : ""}
            </p>
          </div>
          <div className="flex gap-1.5">
            {([["30d", 30], ["90d", 90], ["12mo", 365], ["All", "all"]] as const).map(([label, v]) => (
              <button
                key={label}
                onClick={() => preset(v)}
                className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <RangeSlider min={0} max={totalDays} lo={lo} hi={hi} onChange={(l, h) => { setLo(l); setHi(h); }} />
      </section>

      {/* Filtered stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Open pipeline" value={formatCurrency(pipeline)} hint={`${open.length} open quote${open.length === 1 ? "" : "s"}`} />
        <StatCard icon={<Repeat className="w-4 h-4" />} label="Monthly recurring (open)" value={`${formatCurrency(pipelineMrr)}/mo`} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Won (signed)" value={formatCurrency(wonValue)} hint={`${signed.length} signed`} />
        <StatCard icon={<Trophy className="w-4 h-4" />} label="Win rate" value={winRate != null ? `${winRate}%` : "—"} hint={decided > 0 ? `of ${decided} decided` : "no decided quotes"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quotes by status (filtered) */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Quotes by status</h2>
            <span className="text-sm text-muted-foreground">{inRange.length} in range</span>
          </div>
          {inRange.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes in this range.</p>
          ) : (
            <div className="space-y-2.5">
              {byStatus.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span className={cn("inline-flex w-16 justify-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[status])}>{status}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full", STATUS_BAR[status])} style={{ width: `${(count / maxStatus) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-sm tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Current snapshot: active clients + expiring soon (not range-filtered) */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold">Expiring soon</h2>
            </div>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="w-3.5 h-3.5" /> {clientCount} active client{clientCount === 1 ? "" : "s"}
            </span>
          </div>
          {expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open quotes expiring in the next 14 days.</p>
          ) : (
            <ul className="space-y-2">
              {expiring.map(({ q, days }) => (
                <li key={q.id}>
                  <Link href={`/quotes/${q.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <span className="min-w-0">
                      <span className="font-medium text-sm">{q.client?.company_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground ml-2">{q.quote_number}</span>
                    </span>
                    <span className={cn("text-xs font-medium shrink-0", days < 0 ? "text-red-600" : days <= 3 ? "text-orange-600" : "text-muted-foreground")}>
                      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `in ${days}d`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent quotes (filtered) */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">Recent quotes</h2>
          </div>
          <Link href="/quotes" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 py-8 text-center">No quotes in this range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Quote #</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Value</th>
                <th className="text-right px-5 py-2.5 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recent.map((q) => {
                const rep = repScenario(q);
                return (
                  <tr key={q.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-2.5"><Link href={`/quotes/${q.id}`} className="font-mono text-xs font-medium hover:underline">{q.quote_number}</Link></td>
                    <td className="px-3 py-2.5">{q.client?.company_name ?? "—"}</td>
                    <td className="px-3 py-2.5"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[effectiveStatus(q)])}>{effectiveStatus(q)}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rep ? formatCurrency(rep.total) : "—"}</td>
                    <td className="px-5 py-2.5 text-right text-muted-foreground">{formatDate(q.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold mt-2 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

// Dual-thumb range slider (two overlaid native range inputs). lo/hi are day
// offsets; the colored segment shows the selected window.
function RangeSlider({ min, max, lo, hi, onChange }: { min: number; max: number; lo: number; hi: number; onChange: (lo: number, hi: number) => void }) {
  const pct = (v: number) => ((v - min) / Math.max(1, max - min)) * 100;
  return (
    <div className="dr-slider">
      <style>{`
        .dr-slider{position:relative;height:32px;display:flex;align-items:center}
        .dr-slider .track{position:absolute;left:0;right:0;height:4px;border-radius:9999px;background:hsl(var(--muted))}
        .dr-slider .fill{position:absolute;height:4px;border-radius:9999px;background:hsl(var(--primary))}
        .dr-slider input[type=range]{position:absolute;left:0;width:100%;margin:0;background:transparent;pointer-events:none;-webkit-appearance:none;appearance:none;height:32px}
        .dr-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;pointer-events:auto;height:18px;width:18px;border-radius:9999px;background:hsl(var(--background));border:2px solid hsl(var(--primary));box-shadow:0 1px 2px rgba(0,0,0,.2);cursor:pointer;margin-top:0}
        .dr-slider input[type=range]::-moz-range-thumb{pointer-events:auto;height:18px;width:18px;border-radius:9999px;background:hsl(var(--background));border:2px solid hsl(var(--primary));cursor:pointer}
      `}</style>
      <div className="track" />
      <div className="fill" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
      <input
        type="range" min={min} max={max} step={1} value={lo}
        onChange={(e) => onChange(Math.min(Number(e.target.value), hi), hi)}
        aria-label="Range start"
      />
      <input
        type="range" min={min} max={max} step={1} value={hi}
        onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo))}
        aria-label="Range end"
      />
    </div>
  );
}
