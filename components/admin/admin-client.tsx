"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, AtSign, Building2, CalendarClock, Loader2, Mail, RotateCw, Settings2, Trash2, UserPlus, XCircle, Search } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type { SubscriptionTerm, TenantInvite } from "@/types";
import { PLANS, type PlanKey } from "@/lib/billing/features";
import {
  computeEndDate, subscriptionStatus, todayIso, SUB_STATUS_CLS,
} from "@/lib/access/subscription";
import { TenantMembersManager, type MemberRow } from "./tenant-members-manager";

export interface AdminTenantRow {
  id: string;
  name: string;
  contact_email: string | null;
  created_at: string;
  user_count: number;
  quote_count: number;
  owner_email: string | null;
  owner_name: string | null;
  invite: TenantInvite | null;
  subscription_start: string | null;
  subscription_end: string | null;
  subscription_term: SubscriptionTerm | null;
  plan: PlanKey;
  platform_enabled: boolean;
  suspended_reason: string | null;
  organization_id: string | null;
  organization_name: string | null;
  created_by_org_admin: boolean;
  members: MemberRow[];
}

const TERM_OPTS: { value: SubscriptionTerm | ""; label: string }[] = [
  { value: "", label: "Unlimited (no end date)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom end date" },
];

function fmtDate(d: string | null): string {
  return d ? new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { timeZone: "UTC" }) : "—";
}

const inputCls =
  "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function tenantStatus(row: AdminTenantRow): { label: string; cls: string } {
  if (row.invite?.status === "pending") {
    return { label: "Invite pending", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
  }
  if (row.owner_email) {
    return { label: "Active", cls: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" };
  }
  if (row.invite?.status === "revoked") {
    return { label: "Invite revoked", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" };
  }
  return { label: "No owner", cls: "bg-muted text-muted-foreground" };
}

export function AdminClient({ tenants }: { tenants: AdminTenantRow[] }) {
  const router = useRouter();
  const toast = useToast();

  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [inviteTerm, setInviteTerm] = useState<SubscriptionTerm | "">("yearly");
  const [inviteCustomEnd, setInviteCustomEnd] = useState("");
  const [inviting, setInviting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [manageRow, setManageRow] = useState<AdminTenantRow | null>(null);
  const [emailInvite, setEmailInvite] = useState<TenantInvite | null>(null);
  const [deleteRow, setDeleteRow] = useState<AdminTenantRow | null>(null);

  // The console doesn't live-update (acceptances happen in the invitee's own
  // browser), so poll the server while the tab is open. Skip while the user is
  // mid-action: a modal open, an in-flight invite/action, or the tab hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || manageRow || emailInvite || deleteRow || inviting || actionId) return;
      router.refresh();
    }, 25_000);
    return () => clearInterval(id);
  }, [router, manageRow, emailInvite, deleteRow, inviting, actionId]);

  // Preview the computed end date for the invite form.
  const invitePreviewEnd =
    inviteTerm === "" ? null
    : inviteTerm === "custom" ? (inviteCustomEnd || null)
    : computeEndDate(todayIso(), inviteTerm);

  async function inviteTenant(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/admin/tenants/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          contact_email: contactEmail,
          owner_email: ownerEmail,
          owner_name: ownerName,
          subscription_term: inviteTerm || undefined,
          subscription_end: inviteTerm === "custom" ? inviteCustomEnd : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Invite failed");
        return;
      }
      toast.success(`Invite sent to ${ownerEmail}`);
      setCompanyName(""); setContactEmail(""); setOwnerEmail(""); setOwnerName("");
      setInviteTerm("yearly"); setInviteCustomEnd("");
      router.refresh();
    } finally {
      setInviting(false);
    }
  }

  async function inviteAction(invite: TenantInvite, action: "resend" | "revoke") {
    if (action === "revoke" && !window.confirm(`Revoke the invite for ${invite.email}? Their pending login will be deleted.`)) {
      return;
    }
    setActionId(invite.id);
    try {
      const res = await fetch(`/api/admin/invites/${invite.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || `${action} failed`);
        return;
      }
      toast.success(action === "resend" ? `Invite re-sent to ${invite.email}` : "Invite revoked");
      router.refresh();
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Invite a new tenant */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 px-6 py-4 border-b">
          <UserPlus className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-base">Invite a new MSP tenant</h2>
        </div>
        <form onSubmit={inviteTenant} className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Company name *</label>
            <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className={inputCls} placeholder="New MSP, Inc." />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Company contact email</label>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
              className={inputCls} placeholder="billing@newmsp.com" />
            <p className="text-xs text-muted-foreground">Shown on the tenant record. Defaults to the owner login email if left blank.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Owner login email *</label>
            <input required type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
              className={inputCls} placeholder="owner@newmsp.com" />
            <p className="text-xs text-muted-foreground">The address the owner signs in with. The invite is sent here.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Owner name</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
              className={inputCls} placeholder="Jane Owner" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Subscription term</label>
            <select value={inviteTerm} onChange={(e) => setInviteTerm(e.target.value as SubscriptionTerm | "")}
              className={inputCls}>
              {TERM_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {inviteTerm === "custom" ? "End date *" : "Ends"}
            </label>
            {inviteTerm === "custom" ? (
              <input type="date" min={todayIso()} value={inviteCustomEnd}
                onChange={(e) => setInviteCustomEnd(e.target.value)} className={inputCls} />
            ) : (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {invitePreviewEnd ? fmtDate(invitePreviewEnd) : "No end date"}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Provisions the tenant and emails the owner an invite link. The subscription clock starts
              today ({fmtDate(todayIso())}).
            </p>
            <button type="submit" disabled={inviting}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send invite
            </button>
          </div>
        </form>
      </div>

      {/* Tenant list */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 px-6 py-4 border-b">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold text-base">Tenants</h2>
          <span className="text-sm text-muted-foreground">({tenants.length})</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-6 py-2.5 font-medium">Tenant</th>
              <th className="px-3 py-2.5 font-medium">Organization</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 font-medium text-right" title="Billing basis: active users in the tenant">Users</th>
              <th className="px-3 py-2.5 font-medium text-right">Proposals</th>
              <th className="px-3 py-2.5 font-medium">Created</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Subscription</th>
              <th className="px-6 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((row) => {
              const status = tenantStatus(row);
              const pending = row.invite?.status === "pending" ? row.invite : null;
              // A revoked owner invite with no owner yet → offer Re-invite
              // (resend re-sends the email and flips the invite back to pending).
              const revoked = !row.owner_email && row.invite?.status === "revoked" ? row.invite : null;
              // Any not-yet-accepted invite (pending or revoked) can have its
              // email corrected before the owner accepts.
              const editableInvite =
                !row.owner_email && row.invite && row.invite.status !== "accepted" ? row.invite : null;
              // Empty shell = no active owner AND no quotes. Only these get a
              // list-level Delete; real tenants use the Details → Danger zone
              // (dossier review + grace window) instead.
              const emptyShell = !row.owner_email && row.quote_count === 0;
              return (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-6 py-3">
                    <div className="font-medium">{row.name}</div>
                    {row.contact_email && <div className="text-xs text-muted-foreground">{row.contact_email}</div>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {row.organization_name ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                        <Building2 className="w-3 h-3" /> {row.organization_name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Direct</span>
                    )}
                    {row.created_by_org_admin && (
                      <div className="mt-1">
                        <span
                          title="This workspace was created by an Org Admin — set its subscription term."
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                        >
                          Added by Org Admin
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.owner_email ? (
                      <>
                        <div>{row.owner_name ?? row.owner_email}</div>
                        {row.owner_name && <div className="text-xs text-muted-foreground">{row.owner_email}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.user_count}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.quote_count}</td>
                  <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", status.cls)}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {(() => {
                      const sub = subscriptionStatus(row.subscription_end, row.platform_enabled);
                      return (
                        <div className="flex flex-col gap-1">
                          <span className={cn("inline-block w-fit rounded-full px-2 py-0.5 text-xs font-medium", SUB_STATUS_CLS[sub.status])}>
                            {sub.label}
                          </span>
                          {row.subscription_end && (
                            <span className="text-xs text-muted-foreground">ends {fmtDate(row.subscription_end)}</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/tenants/${row.id}`}
                      className="mr-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      title="View workspace contents (pre-deletion review)"
                    >
                      <Search className="w-3 h-3" /> Details
                    </Link>
                    <button
                      onClick={() => setManageRow(row)}
                      className="mr-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      title="Manage subscription & access"
                    >
                      <Settings2 className="w-3 h-3" /> Manage
                    </button>
                    {pending && (
                      <span className="inline-flex gap-1.5">
                        <button
                          onClick={() => inviteAction(pending, "resend")}
                          disabled={actionId === pending.id}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                          title="Delete the unaccepted invite and send a fresh one"
                        >
                          <RotateCw className="w-3 h-3" /> Resend
                        </button>
                        <button
                          onClick={() => inviteAction(pending, "revoke")}
                          disabled={actionId === pending.id}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 text-xs hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" /> Revoke
                        </button>
                      </span>
                    )}
                    {revoked && (
                      <button
                        onClick={() => inviteAction(revoked, "resend")}
                        disabled={actionId === revoked.id}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        title="Send the owner invite again (reactivates this revoked invite)"
                      >
                        <RotateCw className="w-3 h-3" /> Re-invite
                      </button>
                    )}
                    {editableInvite && (
                      <button
                        onClick={() => setEmailInvite(editableInvite)}
                        disabled={actionId === editableInvite.id}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        title="Send this invite to a different email address"
                      >
                        <AtSign className="w-3 h-3" /> Change email
                      </button>
                    )}
                    {emptyShell && (
                      <button
                        onClick={() => setDeleteRow(row)}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 text-xs hover:bg-destructive/10"
                        title="Permanently delete this empty tenant (no owner, no proposals)"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr><td colSpan={9} className="px-6 py-8 text-center text-muted-foreground">No tenants yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {manageRow && (
        <ManageSubscriptionModal
          // Look up the LIVE row so member actions (which router.refresh()
          // without closing) show fresh data in the still-open modal.
          row={tenants.find((t) => t.id === manageRow.id) ?? manageRow}
          onClose={() => setManageRow(null)}
          onSaved={() => { setManageRow(null); router.refresh(); }}
        />
      )}

      {emailInvite && (
        <ChangeInviteEmailModal
          invite={emailInvite}
          onClose={() => setEmailInvite(null)}
          onSaved={() => { setEmailInvite(null); router.refresh(); }}
        />
      )}

      {deleteRow && (
        <DeleteTenantModal
          row={deleteRow}
          onClose={() => setDeleteRow(null)}
          onDeleted={() => { setDeleteRow(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function DeleteTenantModal({
  row, onClose, onDeleted,
}: { row: AdminTenantRow; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const nameMatches = confirmName.trim() === row.name.trim();

  async function del() {
    if (!nameMatches) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tenants/${row.id}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Delete failed"); return; }
      toast.success(`Deleted ${json.tenantName ?? row.name}`);
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-6 py-4 border-b">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h2 className="font-semibold">Delete tenant</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete <span className="font-medium text-foreground">{row.name}</span> and everything
            under it (invites, settings, any pending logins). This tenant has no active owner and no proposals.{" "}
            <span className="font-medium text-foreground">This cannot be undone.</span>
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Type the tenant name to confirm</label>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)}
              className={inputCls} placeholder={row.name} autoFocus />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          <button onClick={del} disabled={busy || !nameMatches}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeInviteEmailModal({
  invite, onClose, onSaved,
}: { invite: TenantInvite; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState(invite.full_name ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/invites/${invite.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_email", email, full_name: name }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed to change email"); return; }
      toast.success(`Invite sent to ${email.trim().toLowerCase()}`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={save} className="w-full max-w-md rounded-xl border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-6 py-4 border-b">
          <AtSign className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Change invite email</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Currently inviting <span className="font-medium text-foreground">{invite.email}</span>.
            Enter the correct address — we’ll cancel the old invite and email the new one.
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium">New owner login email *</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className={inputCls} placeholder="owner@newmsp.com" autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Owner name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className={inputCls} placeholder="Jane Owner" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send invite
          </button>
        </div>
      </form>
    </div>
  );
}

function ManageSubscriptionModal({
  row, onClose, onSaved,
}: { row: AdminTenantRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(row.name);
  const [email, setEmail] = useState(row.contact_email ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [plan, setPlan] = useState<PlanKey>(row.plan);
  const [savingPlan, setSavingPlan] = useState(false);
  const [start, setStart] = useState(row.subscription_start ?? todayIso());
  const [term, setTerm] = useState<SubscriptionTerm | "">(row.subscription_term ?? "");
  const [customEnd, setCustomEnd] = useState(row.subscription_term === "custom" ? (row.subscription_end ?? "") : "");
  const [savingSub, setSavingSub] = useState(false);
  const [togglingSwitch, setTogglingSwitch] = useState(false);
  const [reason, setReason] = useState(row.suspended_reason ?? "");

  const previewEnd =
    term === "" ? null
    : term === "custom" ? (customEnd || null)
    : computeEndDate(start, term);

  async function saveProfile() {
    if (!name.trim()) { toast.error("Company name is required"); return; }
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/admin/tenants/${row.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed to save"); return; }
      toast.success("Company details updated");
      onSaved();
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePlan() {
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/admin/tenants/${row.id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed to save plan"); return; }
      toast.success("Plan updated");
      onSaved();
    } finally {
      setSavingPlan(false);
    }
  }

  async function saveSubscription() {
    if (term === "custom" && !customEnd) { toast.error("A custom term requires an end date"); return; }
    setSavingSub(true);
    try {
      // term "" → Unlimited (API clears the end date).
      const payload = { start, term: term || undefined, end: term === "custom" ? customEnd : undefined };
      const res = await fetch(`/api/admin/tenants/${row.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed to save"); return; }
      toast.success("Subscription updated");
      onSaved();
    } finally {
      setSavingSub(false);
    }
  }

  async function togglePlatform(enabled: boolean) {
    if (!enabled && !window.confirm(`Suspend ${row.name}? This blocks ALL users including the owner until you re-enable.`)) return;
    setTogglingSwitch(true);
    try {
      const res = await fetch(`/api/admin/tenants/${row.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, reason: enabled ? undefined : reason }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed"); return; }
      toast.success(enabled ? "Tenant enabled" : "Tenant suspended");
      onSaved();
    } finally {
      setTogglingSwitch(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-6 py-4 border-b sticky top-0 bg-card z-10">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Manage — {row.name}</h2>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Company details (platform-managed; tenants can't edit these) */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Company details</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Company name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Acme MSP" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Company contact email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="hello@acmemsp.com" />
              </div>
            </div>
            <button onClick={saveProfile} disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />} Save company details
            </button>
          </div>

          <hr className="border-border" />

          {/* Plan (tier) — controls feature availability via the entitlements matrix */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Plan</div>
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Subscription plan</label>
                <select value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)} className={inputCls}>
                  {PLANS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              <button onClick={savePlan} disabled={savingPlan || plan === row.plan}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {savingPlan && <Loader2 className="w-4 h-4 animate-spin" />} Save plan
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Determines which features this tenant can use (see &ldquo;Feature availability by plan&rdquo;).
            </p>
          </div>

          <hr className="border-border" />

          {/* Subscription */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Start date</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Term</label>
                <select value={term} onChange={(e) => setTerm(e.target.value as SubscriptionTerm | "")} className={inputCls}>
                  {TERM_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {term === "custom" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium">End date *</label>
                <input type="date" min={start} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputCls} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {term === "" ? "No end date (Unlimited)." : <>Ends <span className="font-medium text-foreground">{fmtDate(previewEnd)}</span>.</>}
              </p>
            )}
            <button onClick={saveSubscription} disabled={savingSub}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {savingSub && <Loader2 className="w-4 h-4 animate-spin" />} Save subscription
            </button>
          </div>

          <hr className="border-border" />

          {/* Platform kill switch */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Platform access</div>
            <p className="text-xs text-muted-foreground">
              {row.platform_enabled
                ? "Tenant is enabled. Suspending blocks all its users immediately, regardless of subscription dates."
                : "Tenant is SUSPENDED — all users are blocked."}
            </p>
            {row.platform_enabled ? (
              <>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}
                  placeholder="Reason (optional, shown only to you)" />
                <button onClick={() => togglePlatform(false)} disabled={togglingSwitch}
                  className="inline-flex items-center gap-2 rounded-md border border-destructive/40 text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 disabled:opacity-50">
                  {togglingSwitch && <Loader2 className="w-4 h-4 animate-spin" />} Suspend tenant
                </button>
              </>
            ) : (
              <button onClick={() => togglePlatform(true)} disabled={togglingSwitch}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {togglingSwitch && <Loader2 className="w-4 h-4 animate-spin" />} Re-enable tenant
              </button>
            )}
          </div>

          {/* Team members — transfer ownership / offboard */}
          <TenantMembersManager tenantId={row.id} members={row.members} />
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t sticky bottom-0 bg-card">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Close</button>
        </div>
      </div>
    </div>
  );
}
