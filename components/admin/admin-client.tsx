"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Mail, RotateCw, UserPlus, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type { TenantInvite } from "@/types";

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
  const [inviting, setInviting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

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
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Invite failed");
        return;
      }
      toast.success(`Invite sent to ${ownerEmail}`);
      setCompanyName(""); setContactEmail(""); setOwnerEmail(""); setOwnerName("");
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
            <label className="text-sm font-medium">Contact email</label>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
              className={inputCls} placeholder="billing@newmsp.com (defaults to owner email)" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Owner email *</label>
            <input required type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
              className={inputCls} placeholder="owner@newmsp.com" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Owner name</label>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
              className={inputCls} placeholder="Jane Owner" />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Provisions the tenant and emails the owner an invite link to set their password.
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-6 py-2.5 font-medium">Tenant</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 font-medium text-right" title="Billing basis: active users in the tenant">Users</th>
              <th className="px-3 py-2.5 font-medium text-right">Quotes</th>
              <th className="px-3 py-2.5 font-medium">Created</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-6 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((row) => {
              const status = tenantStatus(row);
              const pending = row.invite?.status === "pending" ? row.invite : null;
              return (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-6 py-3">
                    <div className="font-medium">{row.name}</div>
                    {row.contact_email && <div className="text-xs text-muted-foreground">{row.contact_email}</div>}
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
                  <td className="px-6 py-3 text-right whitespace-nowrap">
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
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No tenants yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
