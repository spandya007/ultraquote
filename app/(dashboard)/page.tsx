import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RefreshOnMount } from "@/components/ui/refresh-on-mount";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { DollarSign, Repeat, CheckCircle2, Users, FileText, Clock, ArrowRight } from "lucide-react";
import type { QuoteStatus } from "@/types";
import { STATUS_STYLES, effectiveStatus, isStaleDraft } from "@/lib/quote-status";

export const dynamic = "force-dynamic";

const OPEN_STATUSES: QuoteStatus[] = ["draft", "sent", "viewed"];

const STATUS_BAR: Record<QuoteStatus, string> = {
  draft: "bg-gray-400", sent: "bg-blue-500", viewed: "bg-purple-500",
  signed: "bg-green-500", declined: "bg-red-500", expired: "bg-orange-500",
};

interface Scenario { is_recommended: boolean; sort_order: number; monthly_recurring_total: number; onetime_total: number; total: number }
interface QuoteRow {
  id: string; quote_number: string; title: string | null; status: QuoteStatus;
  valid_until: string | null; created_at: string; updated_at: string | null;
  client: { company_name: string } | null;
  scenarios: Scenario[];
}

// The representative scenario for a quote: the recommended one, else the first.
function repScenario(q: QuoteRow): Scenario | null {
  const sorted = [...(q.scenarios ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return sorted.find(s => s.is_recommended) ?? sorted[0] ?? null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [{ data: quotesRaw }, { count: clientCount }, { data: settings }] = await Promise.all([
    db.from("quotes").select(`
      id, quote_number, title, status, valid_until, created_at, updated_at,
      client:clients(company_name),
      scenarios:quote_scenarios!quote_id(is_recommended, sort_order, monthly_recurring_total, onetime_total, total)
    `).order("created_at", { ascending: false }),
    db.from("clients").select("*", { count: "exact", head: true }).eq("is_active", true),
    db.from("tenant_settings").select("default_valid_days").maybeSingle(),
  ]);

  const validDays: number = settings?.default_valid_days ?? 30;
  // Hide stale drafts (inactive > Default Valid Days); use effective status
  // everywhere so sent/viewed quotes past their valid-until count as expired.
  const quotes: QuoteRow[] = ((quotesRaw ?? []) as QuoteRow[]).filter(q => !isStaleDraft(q, validDays));

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const open = quotes.filter(q => OPEN_STATUSES.includes(effectiveStatus(q)));
  const signed = quotes.filter(q => q.status === "signed");

  const pipeline = open.reduce((s, q) => s + (repScenario(q)?.total ?? 0), 0);
  const pipelineMrr = open.reduce((s, q) => s + (repScenario(q)?.monthly_recurring_total ?? 0), 0);
  const wonValue = signed.reduce((s, q) => s + (repScenario(q)?.total ?? 0), 0);

  const byStatus = (["draft", "sent", "viewed", "signed", "declined", "expired"] as QuoteStatus[])
    .map(st => ({ status: st, count: quotes.filter(q => effectiveStatus(q) === st).length }));
  const maxStatus = Math.max(1, ...byStatus.map(s => s.count));

  // Win rate among "decided" quotes (signed vs declined)
  const decided = quotes.filter(q => q.status === "signed" || q.status === "declined").length;
  const winRate = decided > 0 ? Math.round((signed.length / decided) * 100) : null;

  // Expiring soon: open quotes with a valid_until within the next 14 days (or overdue)
  const now = Date.now();
  const expiring = quotes
    .filter(q => OPEN_STATUSES.includes(q.status) && q.valid_until)
    .map(q => ({ q, days: Math.ceil((new Date(q.valid_until as string).getTime() - now) / 86400000) }))
    .filter(x => x.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  const recent = quotes.slice(0, 6);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <RefreshOnMount />
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your pipeline at a glance</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="w-4 h-4" />} label="Open pipeline" value={formatCurrency(pipeline)} hint={`${open.length} open quote${open.length === 1 ? "" : "s"}`} />
        <StatCard icon={<Repeat className="w-4 h-4" />} label="Monthly recurring (open)" value={`${formatCurrency(pipelineMrr)}/mo`} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Won (signed)" value={formatCurrency(wonValue)} hint={winRate != null ? `${winRate}% win rate` : undefined} />
        <StatCard icon={<Users className="w-4 h-4" />} label="Active clients" value={String(clientCount ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quotes by status */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Quotes by status</h2>
            <span className="text-sm text-muted-foreground">{quotes.length} total</span>
          </div>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No quotes yet.</p>
          ) : (
            <div className="space-y-2.5">
              {byStatus.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span className={cn("inline-flex w-16 justify-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[status])}>
                    {status}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full", STATUS_BAR[status])} style={{ width: `${(count / maxStatus) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-sm tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Expiring soon */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">Expiring soon</h2>
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

      {/* Recent quotes */}
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
          <p className="text-sm text-muted-foreground px-5 py-8 text-center">No quotes yet — create your first one.</p>
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
              {recent.map(q => {
                const rep = repScenario(q);
                return (
                  <tr key={q.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-2.5">
                      <Link href={`/quotes/${q.id}`} className="font-mono text-xs font-medium hover:underline">{q.quote_number}</Link>
                    </td>
                    <td className="px-3 py-2.5">{q.client?.company_name ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[effectiveStatus(q)])}>{effectiveStatus(q)}</span>
                    </td>
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
