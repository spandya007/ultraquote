"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, Users, FileText, CheckCircle, XCircle, Clock, AlertCircle,
  Loader2, Plus, Ban, Play, Search, Megaphone,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type { OrgWorkspaceRow, OrgAdminRow, OrgAdminInviteRow } from "@/app/org/page";

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function statusBadge(row: OrgWorkspaceRow) {
  if (!row.platform_enabled) {
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"><XCircle className="w-3 h-3" /> Suspended</span>;
  }
  if (row.subscription_end) {
    const end = new Date(`${row.subscription_end}T00:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (end < today) {
      return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"><AlertCircle className="w-3 h-3" /> Expired</span>;
    }
  }
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"><CheckCircle className="w-3 h-3" /> Active</span>;
}

function inviteStatusBadge(status: string) {
  if (status === "pending") return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><Clock className="w-3 h-3" /> Pending</span>;
  if (status === "revoked") return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground"><XCircle className="w-3 h-3" /> Revoked</span>;
  return null;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function OrgClient({
  workspaces,
  admins,
  pendingInvites,
  voice,
}: {
  workspaces: OrgWorkspaceRow[];
  admins: OrgAdminRow[];
  pendingInvites: OrgAdminInviteRow[];
  orgId: string;
  voice: { businessType: string; businessAbout: string; brandVoice: string };
}) {
  const router = useRouter();
  const toast = useToast();

  const [actionId, setActionId] = useState<string | null>(null);

  // Org-default Proposal Voice (applies to all workspaces unless they set their own)
  const [bizType, setBizType] = useState(voice.businessType);
  const [bizAbout, setBizAbout] = useState(voice.businessAbout);
  const [brandVoice, setBrandVoice] = useState(voice.brandVoice);
  const [savingVoice, setSavingVoice] = useState(false);

  async function saveVoice() {
    setSavingVoice(true);
    try {
      const res = await fetch("/api/org/voice", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType: bizType, businessAbout: bizAbout, brandVoice }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Save failed");
      }
      toast.success("Org default voice saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingVoice(false);
    }
  }

  // Invite-new-workspace form
  const [showNew, setShowNew] = useState(false);
  const [wsName, setWsName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [creating, setCreating] = useState(false);

  async function toggleSuspend(ws: OrgWorkspaceRow) {
    const suspending = ws.platform_enabled;
    if (suspending && !confirm(`Suspend "${ws.name}"? This blocks ALL its users — including the owner — until you re-enable it.`)) return;
    setActionId(ws.id);
    const res = await fetch(`/api/org/workspaces/${ws.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !suspending }),
    });
    const j = await res.json();
    setActionId(null);
    if (!res.ok) { toast.error(j.error ?? "Failed to update"); return; }
    toast.success(suspending ? `${ws.name} suspended` : `${ws.name} re-enabled`);
    router.refresh();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch(`/api/org/workspaces/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: wsName, owner_email: ownerEmail, owner_name: ownerName || null }),
    });
    const j = await res.json();
    setCreating(false);
    if (!res.ok) { toast.error(j.error ?? "Failed to create workspace"); return; }
    toast.success(`Workspace created — owner invite sent to ${ownerEmail}`);
    setWsName(""); setOwnerEmail(""); setOwnerName(""); setShowNew(false);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {/* Workspaces */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold">Workspaces</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{workspaces.length}</span>
          </div>
          {!showNew && (
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> Invite new workspace
            </button>
          )}
        </div>

        {showNew && (
          <form onSubmit={handleCreate} className="mb-4 rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">New workspace</h3>
            <p className="text-xs text-muted-foreground">
              Creates a workspace in your organization and emails its owner an invite. Your Platform Admin is notified and sets its subscription.
            </p>
            <div className="flex flex-wrap gap-2">
              <input className={cn(inputCls, "flex-1 min-w-40")} required placeholder="Workspace / company name"
                value={wsName} onChange={(e) => setWsName(e.target.value)} autoFocus />
              <input className={cn(inputCls, "flex-1 min-w-40")} type="email" required placeholder="Owner email"
                value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
              <input className={cn(inputCls, "flex-1 min-w-32")} placeholder="Owner name (optional)"
                value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNew(false)} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancel</button>
              <button type="submit" disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create & invite owner
              </button>
            </div>
          </form>
        )}

        {workspaces.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
            No workspaces in this organization yet.
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Workspace</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Owner</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground" title="Users">
                    <Users className="w-3.5 h-3.5 inline" />
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground" title="Quotes">
                    <FileText className="w-3.5 h-3.5 inline" />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Subscription</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{ws.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ws.owner_email ? (
                        <span title={ws.owner_name ?? undefined}>{ws.owner_email}</span>
                      ) : (
                        <span className="italic">No owner</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{ws.user_count}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{ws.quote_count}</td>
                    <td className="px-4 py-3">{statusBadge(ws)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {ws.subscription_end
                        ? <>Until {new Date(`${ws.subscription_end}T00:00:00.000Z`).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</>
                        : "Unlimited"
                      }
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/org/workspaces/${ws.id}`}
                        className="mr-1.5 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                        title="View workspace stats + download report"
                      >
                        <Search className="w-3.5 h-3.5" /> Details
                      </Link>
                      <button
                        onClick={() => toggleSuspend(ws)}
                        disabled={actionId === ws.id}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50",
                          ws.platform_enabled ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"
                        )}
                      >
                        {actionId === ws.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : ws.platform_enabled ? <Ban className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {ws.platform_enabled ? "Suspend" : "Re-enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          You can suspend or re-enable a workspace. Deleting a workspace and setting subscriptions are handled by your Platform Admin.
        </p>
      </section>

      {/* Org Admins */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Org Admins</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{admins.length}</span>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          {admins.length === 0 && pendingInvites.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No admins enrolled yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {admins.map((a) => (
                  <tr key={a.user_id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.full_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
                {pendingInvites.map((inv) => (
                  <tr key={inv.id} className={cn("hover:bg-muted/20 transition-colors", inv.status === "revoked" && "opacity-50")}>
                    <td className="px-4 py-3 text-muted-foreground">{inv.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{inviteStatusBadge(inv.status)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(inv.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="px-4 py-3 text-xs text-muted-foreground border-t">
            Org Admins are invited by your Platform Admin.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Megaphone className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Proposal Voice — org default</h2>
        </div>
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <p className="text-sm text-muted-foreground -mt-1">
            Sets the default AI writing voice for <strong>every workspace in your organization</strong>.
            Inheritance is per field: a workspace uses your default for any field it leaves blank, and
            overrides it on any field it fills in (its own Settings → Proposal Voice). Leave a field blank
            here for a neutral professional voice.
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium">What the business does</label>
            <input
              value={bizType}
              onChange={(e) => setBizType(e.target.value)}
              maxLength={120}
              className={inputCls}
              placeholder="e.g. Commercial security camera & access-control installer"
            />
            <p className="text-xs text-muted-foreground">One line — used as the author&apos;s role in AI drafts.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">About the business</label>
            <textarea
              value={bizAbout}
              onChange={(e) => setBizAbout(e.target.value)}
              rows={3}
              maxLength={1000}
              className={cn(inputCls, "resize-y")}
              placeholder="Differentiators the AI can draw on — e.g. licensed & insured, 12 years in the Bay Area, NDAA-compliant gear, in-house techs."
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Brand voice &amp; writing style</label>
            <textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={3}
              maxLength={500}
              className={cn(inputCls, "resize-y")}
              placeholder="e.g. Warm and consultative; plain language, no jargon. One short paragraph per section. Don't address the client by name."
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={saveVoice}
              disabled={savingVoice}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {savingVoice ? "Saving…" : "Save org default"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
