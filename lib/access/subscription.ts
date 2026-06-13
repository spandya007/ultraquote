import type { SubscriptionTerm } from "@/types";
import { GRACE_DAYS } from "./access-state";

// Subscription date math + status labelling, shared by the platform admin UI
// (set dates, badges) and the owner's read-only status card.
// See docs/subscription-and-access-lifecycle-design.md (§3, §6).

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Compute the end date from a start date ('YYYY-MM-DD') + term. Returns null
// for 'custom' (admin picks the end date directly). Month/year math uses UTC and
// lets JS roll over month overflow (e.g. Jan 31 + 1 month → early Mar), which is
// fine for a billing anchor.
export function computeEndDate(startIso: string, term: SubscriptionTerm): string | null {
  if (term === "custom") return null;
  const d = new Date(`${startIso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (term === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (term === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (term === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export type SubStatus = "unlimited" | "active" | "expiring" | "grace" | "expired" | "suspended";

export interface SubStatusInfo {
  status: SubStatus;
  label: string;
  /** days until end (negative once past); null when unlimited */
  daysToEnd: number | null;
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

// Resolve a display status for a tenant's subscription. `platformEnabled=false`
// always wins (suspended). Mirrors the access resolver's date logic.
export function subscriptionStatus(
  end: string | null,
  platformEnabled: boolean,
): SubStatusInfo {
  if (!platformEnabled) return { status: "suspended", label: "Suspended", daysToEnd: null };
  if (!end) return { status: "unlimited", label: "Unlimited", daysToEnd: null };

  const today = todayIso();
  const days = daysBetweenIso(today, end); // >0 future, 0 today, <0 past

  if (days >= 0) {
    return days <= 7
      ? { status: "expiring", label: `Expiring (${days}d)`, daysToEnd: days }
      : { status: "active", label: "Active", daysToEnd: days };
  }
  // past the end date
  if (-days <= GRACE_DAYS) {
    return { status: "grace", label: "In grace (read-only)", daysToEnd: days };
  }
  return { status: "expired", label: "Expired", daysToEnd: days };
}

export const SUB_STATUS_CLS: Record<SubStatus, string> = {
  unlimited: "bg-muted text-muted-foreground",
  active: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  expiring: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  grace: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  expired: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  suspended: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};
