"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Mail, Check, RotateCcw, Send } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

export interface BetaSignupRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  message: string | null;
  created_at: string;
  invited_at: string | null;
  status: "new" | "invited" | "declined";
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

const STATUS_CLS: Record<BetaSignupRow["status"], string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  invited: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  declined: "bg-muted text-muted-foreground",
};

export function BetaSignupsCard({ signups }: { signups: BetaSignupRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [actionId, setActionId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; hint?: string } | null>(null);

  const newCount = signups.filter((s) => s.status === "new").length;

  async function sendTestEmail() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setTestResult({ ok: !!data.ok, message: data.message || "No response.", hint: data.hint });
      if (data.ok) toast.success("Test email sent");
      else toast.error("Test email failed");
    } catch {
      setTestResult({ ok: false, message: "Network error calling the test endpoint." });
    } finally {
      setTesting(false);
    }
  }

  async function setStatus(row: BetaSignupRow, status: BetaSignupRow["status"]) {
    setActionId(row.id);
    try {
      const res = await fetch(`/api/admin/beta-signups/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Update failed");
      }
      toast.success(status === "invited" ? "Marked as invited" : "Moved back to new");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionId(null);
    }
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Inbox className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-base">Beta signups</h2>
          {newCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
              {newCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={sendTestEmail}
            disabled={testing}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            title="Send a test email to verify SMTP notifications work"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Send test email
          </button>
          <span className="text-xs text-muted-foreground tabular-nums">{signups.length} total</span>
        </div>
      </div>

      {testResult && (
        <div
          className={cn(
            "border-b px-4 py-2.5 text-xs",
            testResult.ok
              ? "bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300"
              : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
          )}
        >
          <span className="font-medium">{testResult.message}</span>
          {testResult.hint && <div className="mt-1 opacity-90">{testResult.hint}</div>}
        </div>
      )}

      {signups.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No beta signups yet. Submissions from{" "}
          <span className="font-mono">/beta</span> will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Requested</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((row) => {
                const busy = actionId === row.id;
                return (
                  <tr key={row.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.company_name}</div>
                      {row.message && (
                        <div className="mt-0.5 max-w-xs text-xs text-muted-foreground">{row.message}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{row.contact_name}</div>
                      <a
                        href={`mailto:${row.email}?subject=${encodeURIComponent("Your UltraQuote beta invite")}`}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Mail className="w-3 h-3" /> {row.email}
                      </a>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLS[row.status])}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === "invited" ? (
                        <button
                          onClick={() => setStatus(row, "new")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          Mark new
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus(row, "invited")}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Mark invited
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
