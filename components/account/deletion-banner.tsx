import { AlertTriangle } from "lucide-react";

// Shown to a tenant whose workspace is scheduled for permanent deletion. The
// workspace stays usable until the date so they can export — this just warns.
export function DeletionBanner({ scheduledAt }: { scheduledAt: string }) {
  const when = new Date(scheduledAt).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <div className="flex items-start gap-2.5 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>Your workspace is scheduled for permanent deletion on {when}.</strong> Please save
        copies of anything you need to keep before then — you can download individual quotes as PDFs.
        If you need a full copy of your data, or this is a mistake, contact{" "}
        <a href="mailto:hello@ultraquote.io" className="underline">hello@ultraquote.io</a> right away.
      </span>
    </div>
  );
}
