"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle, CalendarClock } from "lucide-react";
import { useToast } from "@/components/ui/toast";

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function TenantDangerZone({
  tenantId,
  tenantName,
  deletionScheduledAt,
  deletionReason,
}: {
  tenantId: string;
  tenantName: string;
  deletionScheduledAt: string | null;
  deletionReason: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<null | "schedule" | "cancel" | "purge">(null);

  const nameMatches = confirmName.trim() === tenantName.trim();
  const scheduled = !!deletionScheduledAt;
  const due = scheduled && new Date(deletionScheduledAt!).getTime() <= Date.now();

  async function call(path: string, method: string, body?: object) {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function schedule() {
    setBusy("schedule");
    try {
      const d = await call(`/api/admin/tenants/${tenantId}/schedule-deletion`, "POST", {
        confirmName, reason,
      });
      toast.success(`Deletion scheduled for ${fmtDateTime(d.deletion_scheduled_at)}`);
      setConfirmName(""); setReason("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await call(`/api/admin/tenants/${tenantId}/schedule-deletion`, "DELETE");
      toast.success("Scheduled deletion cancelled");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function purgeNow() {
    if (!window.confirm(`PERMANENTLY delete ${tenantName} and ALL its data right now? This cannot be undone.`)) return;
    setBusy("purge");
    try {
      const d = await call(`/api/admin/tenants/${tenantId}/purge`, "POST", { confirmName });
      toast.success(`Purged ${d.tenantName ?? tenantName} (${d.usersDeleted} logins removed)`);
      router.push("/admin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/40 p-4 dark:border-red-500/30 dark:bg-red-500/5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-base text-red-700 dark:text-red-300">
        <AlertTriangle className="w-4 h-4" /> Danger zone — delete tenant
      </h2>

      {scheduled ? (
        <>
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm dark:border-red-500/30 dark:bg-transparent">
            <CalendarClock className="mt-0.5 h-4 w-4 text-red-600" />
            <div>
              <div className="font-medium text-red-700 dark:text-red-300">
                Scheduled for permanent deletion on {fmtDateTime(deletionScheduledAt!)}
                {due ? " — now due" : ""}.
              </div>
              {deletionReason && <div className="text-muted-foreground">Reason: {deletionReason}</div>}
              <div className="text-muted-foreground">The workspace stays usable until then so the owner can save copies of their data.</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={cancel}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Cancel scheduled deletion
            </button>
            <div className="flex items-center gap-2">
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={`Type "${tenantName}" to delete now`}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={purgeNow}
                disabled={busy !== null || !nameMatches}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy === "purge" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete now
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            Schedule permanent deletion. The tenant is purged after a grace period (you can cancel before
            then). Type the exact tenant name to confirm.
          </p>
          <div className="space-y-2">
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={`Type "${tenantName}" to confirm`}
              className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={schedule}
              disabled={busy !== null || !nameMatches}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy === "schedule" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Schedule deletion
            </button>
          </div>
        </>
      )}
    </section>
  );
}
