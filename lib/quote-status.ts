import type { QuoteStatus } from "@/types";

// Status is SYSTEM-MANAGED: created as draft, set to sent by the send route,
// moved by the e-signature webhook (viewed/signed/declined), and derived as
// expired from the valid_until date. The client UI never writes status.

export const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft:    "bg-gray-100 text-gray-600",
  sent:     "bg-blue-100 text-blue-700",
  viewed:   "bg-purple-100 text-purple-700",
  signed:   "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired:  "bg-orange-100 text-orange-700",
};

/**
 * Effective (display) status. `expired` is DERIVED, not stored: a sent/viewed
 * quote past its valid_until shows as expired, and extending the date
 * automatically "reactivates" it. Drafts never expire (an offer never made
 * can't lapse) and signed/declined are unaffected by dates.
 */
export function effectiveStatus(q: { status: QuoteStatus; valid_until: string | null }): QuoteStatus {
  if ((q.status === "sent" || q.status === "viewed") && q.valid_until) {
    if (new Date(`${q.valid_until}T23:59:59`) < new Date()) return "expired";
  }
  return q.status;
}

/**
 * A draft with no activity for longer than the tenant's Default Valid Days is
 * "stale" and hidden from views. Based on updated_at (last edit), so actively
 * worked drafts never disappear. Raise Default Valid Days in Settings to
 * reveal older drafts.
 */
export function isStaleDraft(
  q: { status: QuoteStatus; updated_at?: string | null; created_at?: string | null },
  validDays: number
): boolean {
  if (q.status !== "draft") return false;
  const basis = q.updated_at ?? q.created_at;
  if (!basis) return false;
  return new Date(basis).getTime() < Date.now() - validDays * 86400000;
}
