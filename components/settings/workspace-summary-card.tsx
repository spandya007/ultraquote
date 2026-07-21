import { Boxes } from "lucide-react";
import type { TenantDossier } from "@/lib/admin/tenant-dossier";

// Owner-only "what's in your workspace" self-view (Settings). A lighter read of
// the same dossier the platform admin sees — so owners know what they have
// before requesting account deletion or making big changes.
function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={`rounded-md p-3 ${warn ? "bg-amber-50 dark:bg-amber-500/10" : "bg-muted/40"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</div>
    </div>
  );
}

export function WorkspaceSummaryCard({ dossier }: { dossier: TenantDossier }) {
  const { counts, flagged } = dossier;
  const inFlight = flagged.inFlightQuotes.length;
  const signed = flagged.signedQuotes.length;

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Boxes className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-semibold">Your workspace</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        A summary of what&apos;s stored in your SmartProps account. Keep this in mind before requesting
        account deletion — save copies of anything you need to keep (you can download individual proposals
        as PDFs).
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clients" value={counts.clients} />
        <Stat label="Active products" value={counts.productsActive} />
        <Stat label="Proposals" value={counts.quotesTotal} />
        <Stat label="Templates" value={counts.templates} />
        <Stat label="Signed proposals" value={signed} warn={signed > 0} />
        <Stat label="Sent / awaiting" value={inFlight} warn={inFlight > 0} />
        <Stat label="Team members" value={dossier.users.length} />
      </div>

      {(signed > 0 || inFlight > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          You have{signed > 0 ? ` ${signed} signed` : ""}{signed > 0 && inFlight > 0 ? " and" : ""}
          {inFlight > 0 ? ` ${inFlight} sent` : ""} proposal(s). These represent completed or in-progress
          deals — be sure to download them (as PDFs) before any account deletion.
        </div>
      )}
    </div>
  );
}
