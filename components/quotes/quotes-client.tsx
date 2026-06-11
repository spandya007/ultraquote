"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, FileText, Copy, Loader2, Eye } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { useToast } from "@/components/ui/toast";
import type { QuoteStatus } from "@/types";
import { STATUS_STYLES, effectiveStatus, isStaleDraft } from "@/lib/quote-status";
import { NewQuoteModal } from "./new-quote-modal";

interface QuoteRow {
  id: string;
  quote_number: string;
  title: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  created_at: string;
  updated_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_by: string | null;
  client: { id: string; company_name: string; contact_name: string | null } | null;
  signers?: { signer_email: string; role: string | null; status: string; signing_order: number; decline_reason: string | null }[];
  creator?: { full_name: string | null; email: string } | null;
}

// Tooltip for the status badge — decline comment on declined quotes, and
// per-signer signing progress while a round is in flight (sent/viewed).
function statusTooltip(q: QuoteRow): string | undefined {
  const eff = effectiveStatus(q);
  if (eff === "expired") {
    return "Past its Valid Until date — open the quote and extend the date to reactivate";
  }
  if (q.status === "declined") {
    const decliner = (q.signers ?? []).find(s => s.status === "declined" && s.decline_reason);
    if (!decliner) return "Declined (no reason given)";
    return `Declined by ${decliner.signer_email}: ${decliner.decline_reason}`;
  }
  if (q.status === "sent" || q.status === "viewed") {
    const sigs = [...(q.signers ?? [])].sort((a, b) => (a.signing_order ?? 0) - (b.signing_order ?? 0));
    if (sigs.length === 0) return undefined;
    return sigs.map(s => {
      const who = s.role === "MSP Owner" ? "My company" : "Client";
      const state =
        s.status === "signed" ? "signed ✓" :
        s.status === "viewed" ? "viewed, awaiting signature" :
        "awaiting";
      return `${who} (${s.signer_email}): ${state}`;
    }).join("  ·  ");
  }
  return undefined;
}

interface ClientOption {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
}

interface Props {
  initialQuotes: QuoteRow[];
  clients: ClientOption[];
  /** tenant_settings.default_valid_days — drafts inactive longer than this are hidden. */
  validDays: number;
  currentUserId: string;
  /** Tenant owner can edit every quote (no read-only rows). */
  isOwner: boolean;
  /** Teammates (for the created-by filter), current user excluded. */
  teamUsers: { id: string; name: string }[];
}

export function QuotesClient({ initialQuotes, clients, validDays, currentUserId, isOwner, teamUsers }: Props) {
  const router = useRouter();
  const toast = useToast();
  // Use the server prop directly (don't freeze it in state) so the list always
  // reflects the latest fetch after navigation/refresh.
  const quotes = initialQuotes;
  // Re-fetch on every visit — the App Router client cache can serve a stale
  // payload on soft navigation (e.g. returning here after sending a quote).
  useEffect(() => { router.refresh(); }, [router]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | "all">("all");
  const [filterClient, setFilterClient] = useState<string>("all");
  // Default to the user's own quotes ("mine"); "all" or a teammate's user id.
  const [filterOwner, setFilterOwner] = useState<string>("mine");
  const [modalOpen, setModalOpen] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  async function duplicateQuote(id: string) {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/quotes/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate");
      toast.success(`Created ${data.quote_number}`);
      router.push(`/quotes/${data.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setDuplicatingId(null);
    }
  }

  // Hide drafts with no activity for longer than Default Valid Days.
  const visibleQuotes = useMemo(() => quotes.filter(q => !isStaleDraft(q, validDays)), [quotes, validDays]);
  const hiddenDrafts = quotes.length - visibleQuotes.length;

  const filtered = useMemo(() => {
    return visibleQuotes.filter((q) => {
      if (filterOwner === "mine" && q.created_by !== currentUserId) return false;
      if (filterOwner !== "mine" && filterOwner !== "all" && q.created_by !== filterOwner) return false;
      if (filterStatus !== "all" && effectiveStatus(q) !== filterStatus) return false;
      if (filterClient !== "all" && q.client?.id !== filterClient) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          q.quote_number.toLowerCase().includes(s) ||
          (q.title ?? "").toLowerCase().includes(s) ||
          (q.client?.company_name ?? "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [visibleQuotes, search, filterStatus, filterClient, filterOwner, currentUserId]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{filterOwner === "mine" ? "My Quotes" : "Quotes"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} of {visibleQuotes.length} quotes
            {hiddenDrafts > 0 && (
              <span className="ml-2 text-xs">
                · {hiddenDrafts} older draft{hiddenDrafts === 1 ? "" : "s"} hidden (inactive &gt;{validDays} days — raise “Default Valid Days” in Settings to show)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Quote
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select
          value={filterOwner}
          onChange={(e) => setFilterOwner(e.target.value)}
          title="Whose quotes to show — teammates' quotes open read-only"
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="mine">My Quotes</option>
          <option value="all">All Quotes</option>
          {teamUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search quotes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Statuses</option>
          {(["draft","sent","viewed","signed","declined","expired"] as QuoteStatus[]).map((s) => (
            <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All Clients</option>
          {clients
            .slice()
            .sort((a, b) => a.company_name.localeCompare(b.company_name))
            .map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {visibleQuotes.length === 0
              ? "No quotes yet — create your first quote."
              : filterOwner === "mine"
              ? "You haven't created any quotes yet — switch the selector to All Quotes to see your team's, or create your first one."
              : "No quotes match your filters."}
          </p>
          {visibleQuotes.length === 0 && (
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              New Quote
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Quote #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Valid Until</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground" title="Only the creator (and the tenant owner) can edit a quote — everyone else sees it read-only">Created by</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((q) => (
                <tr
                  key={q.id}
                  onClick={() => router.push(`/quotes/${q.id}`)}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium">{q.quote_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{q.client?.company_name ?? "—"}</p>
                    {q.client?.contact_name && (
                      <p className="text-xs text-muted-foreground">{q.client.contact_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      {q.title ?? "—"}
                      {!isOwner && q.created_by !== currentUserId && (
                        <span
                          title="Created by a teammate — opens read-only (use Duplicate to make your own editable copy)"
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium shrink-0"
                        >
                          <Eye className="w-3 h-3" /> read-only
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={statusTooltip(q)}
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                        STATUS_STYLES[effectiveStatus(q)],
                        statusTooltip(q) && "cursor-help"
                      )}
                    >
                      {effectiveStatus(q)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {q.valid_until ? formatDate(q.valid_until) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground truncate max-w-[10rem]">
                    {q.creator?.full_name || q.creator?.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(q.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateQuote(q.id); }}
                      disabled={duplicatingId === q.id}
                      title="Duplicate quote"
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {duplicatingId === q.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Copy className="w-3.5 h-3.5" />}
                      Duplicate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewQuoteModal
        open={modalOpen}
        clients={clients}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => { setModalOpen(false); router.push(`/quotes/${id}`); }}
      />
    </>
  );
}
