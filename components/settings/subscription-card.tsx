import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { subscriptionStatus, SUB_STATUS_CLS } from "@/lib/access/subscription";
import type { SubscriptionTerm } from "@/types";

// Settings → Subscription: read-only status for the tenant OWNER. Dates are
// managed by the platform admin (UltraQuote), so this only displays state.
// See docs/subscription-and-access-lifecycle-design.md (§7).
function fmt(d: string | null): string {
  return d ? new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }) : "—";
}

const TERM_LABEL: Record<SubscriptionTerm, string> = {
  monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly", custom: "Custom",
};

export function SubscriptionCard({
  start, end, term, platformEnabled,
}: {
  start: string | null;
  end: string | null;
  term: SubscriptionTerm | null;
  platformEnabled: boolean;
}) {
  const sub = subscriptionStatus(end, platformEnabled);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <span className="text-muted-foreground"><CalendarClock className="w-4 h-4" /></span>
        <h2 className="font-semibold text-base">Subscription</h2>
        <span className={cn("ml-1 rounded-full px-2 py-0.5 text-xs font-medium", SUB_STATUS_CLS[sub.status])}>
          {sub.label}
        </span>
      </div>
      <div className="px-6 py-5 space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Started</div>
            <div className="font-medium">{fmt(start)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ends</div>
            <div className="font-medium">{end ? fmt(end) : "No end date"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Term</div>
            <div className="font-medium">{term ? TERM_LABEL[term] : "Unlimited"}</div>
          </div>
        </div>
        {sub.status === "grace" && (
          <p className="text-red-700 dark:text-red-300">
            Your subscription has lapsed — the account is read-only until it’s renewed.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Subscription dates are managed by UltraQuote. To renew or change your plan, contact UltraQuote.
        </p>
      </div>
    </div>
  );
}
