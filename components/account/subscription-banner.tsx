"use client";

import { useEffect, useState } from "react";

// Subscription notice shown at the top of the dashboard:
//  - "expiring": amber reminder in the last 7 days before the end date (dismissible)
//  - "grace":    red read-only notice after the end date, within the grace window
// See docs/subscription-and-access-lifecycle-design.md (§5).

type Props =
  | { mode: "expiring"; endDate: string; daysToExpiry: number; isOwner: boolean }
  | { mode: "grace"; endDate: string; graceEndsOn: string; isOwner: boolean };

function fmt(d: string): string {
  return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SubscriptionBanner(props: Props) {
  // Dismiss is per end-date so a renewal (new end date) re-arms the banner.
  // Grace is NOT dismissible — it's an active read-only state, not a reminder.
  const storageKey = `smartprops.subBanner.dismissed.${props.endDate}`;
  const [dismissed, setDismissed] = useState(true); // default hidden until we read storage (avoids flash)

  useEffect(() => {
    if (props.mode === "grace") {
      setDismissed(false);
      return;
    }
    setDismissed(localStorage.getItem(storageKey) === "1");
  }, [storageKey, props.mode]);

  if (dismissed) return null;

  const renew = props.isOwner ? " Contact SmartProps to renew." : "";

  if (props.mode === "grace") {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <span className="font-medium">Subscription expired.</span> Your account is read-only — you can
        view but not create, edit, or send. Access ends {fmt(props.graceEndsOn)} if not renewed.{renew}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
      <span>
        <span className="font-medium">
          Your SmartProps subscription ends in {props.daysToExpiry}{" "}
          {props.daysToExpiry === 1 ? "day" : "days"}
        </span>{" "}
        ({fmt(props.endDate)}).{renew}
      </span>
      <button
        onClick={() => {
          localStorage.setItem(storageKey, "1");
          setDismissed(true);
        }}
        className="shrink-0 rounded px-2 py-0.5 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20"
        aria-label="Dismiss"
      >
        Dismiss
      </button>
    </div>
  );
}
