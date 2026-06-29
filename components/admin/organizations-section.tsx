"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, ChevronDown, ChevronRight, Loader2, Mail, UserPlus, XCircle, RotateCw,
  Pencil, Check, Users, FileText, Plus, Link2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

export interface OrgMemberWorkspace {
  id: string;
  name: string;
  owner_email: string | null;
  user_count: number;
  quote_count: number;
}

export interface OrgEnrolledAdmin {
  user_id: string;
  email: string | null;
}

export interface OrgRow {
  id: string;
  name: string;
  slug: string | null;
  platform_enabled: boolean;
  created_at: string;
  workspace_count: number;
  admin_count: number;
  workspaces: OrgMemberWorkspace[];
  admins: OrgEnrolledAdmin[];
}

export interface OrgAdminInviteRow {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
}

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function InviteStatusBadge({ status }: { status: string }) {
  if (status === "pending") return <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Pending</span>;
  if (status === "revoked") return <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">Revoked</span>;
  return null;
}

function OrgCard({
  org,
  standaloneWorkspaces,
}: {
  org: OrgRow;
  standaloneWorkspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);

  // Edit org name/slug
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(org.name);
  const [editSlug, setEditSlug] = useState(org.slug ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  // Org Admin invites
  const [invites, setInvites] = useState<OrgAdminInviteRow[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  // Assign existing workspace
  const [assignId, setAssignId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Invite NEW workspace into the org
  const [showNewWs, setShowNewWs] = useState(false);
  const [wsCompany, setWsCompany] = useState("");
  const [wsOwnerEmail, setWsOwnerEmail] = useState("");
  const [wsOwnerName, setWsOwnerName] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);

  async function loadInvites() {
    setLoadingInvites(true);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}/invites`);
      const j = await res.json();
      setInvites(j.invites ?? []);
    } finally {
      setLoadingInvites(false);
    }
  }

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && invites.length === 0) await loadInvites();
  }

  async function handleSaveEdit() {
    if (!editName.trim()) { toast.error("Name is required"); return; }
    setSavingEdit(true);
    const res = await fetch(`/api/admin/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), slug: editSlug.trim() || null }),
    });
    const j = await res.json();
    setSavingEdit(false);
    if (!res.ok) { toast.error(j.error ?? "Failed to save"); return; }
    toast.success("Organization updated");
    setEditing(false);
    router.refresh();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    const res = await fetch(`/api/admin/orgs/${org.id}/invite-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, full_name: inviteName || null }),
    });
    const j = await res.json();
    setInviting(false);
    if (!res.ok) { toast.error(j.error ?? "Failed to invite"); return; }
    toast.success(`Invite sent to ${inviteEmail}`);
    setInviteEmail(""); setInviteName("");
    await loadInvites();
    router.refresh();
  }

  async function handleInviteAction(inviteId: string, action: "resend" | "revoke") {
    setActionId(inviteId);
    const res = await fetch(`/api/admin/orgs/${org.id}/invites/${inviteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json();
    setActionId(null);
    if (!res.ok) { toast.error(j.error ?? "Action failed"); return; }
    toast.success(action === "resend" ? "Invite resent" : "Invite revoked");
    await loadInvites();
    router.refresh();
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignId) return;
    setAssigning(true);
    const res = await fetch(`/api/admin/tenants/${assignId}/organization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id }),
    });
    const j = await res.json();
    setAssigning(false);
    if (!res.ok) { toast.error(j.error ?? "Failed to assign"); return; }
    toast.success("Workspace added to organization");
    setAssignId("");
    router.refresh();
  }

  async function handleRemoveWorkspace(wsId: string, wsName: string) {
    if (!confirm(`Remove "${wsName}" from ${org.name}? It becomes a standalone workspace again (its data is untouched).`)) return;
    const res = await fetch(`/api/admin/tenants/${wsId}/organization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: null }),
    });
    const j = await res.json();
    if (!res.ok) { toast.error(j.error ?? "Failed to remove"); return; }
    toast.success("Workspace removed from organization");
    router.refresh();
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreatingWs(true);
    const res = await fetch(`/api/admin/tenants/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: wsCompany,
        owner_email: wsOwnerEmail,
        owner_name: wsOwnerName || null,
        organization_id: org.id,
      }),
    });
    const j = await res.json();
    setCreatingWs(false);
    if (!res.ok) { toast.error(j.error ?? "Failed to create workspace"); return; }
    toast.success(`Workspace created — owner invite sent to ${wsOwnerEmail}`);
    setWsCompany(""); setWsOwnerEmail(""); setWsOwnerName(""); setShowNewWs(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={toggle} className="flex items-center gap-3 flex-1 text-left min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-medium truncate">{org.name}</span>
          {org.slug && <span className="text-xs text-muted-foreground shrink-0">/{org.slug}</span>}
        </button>
        <div className="shrink-0 text-right max-w-[45%]">
          <div className="text-xs text-muted-foreground">
            {org.workspace_count} workspace{org.workspace_count !== 1 ? "s" : ""} · {org.admin_count} admin{org.admin_count !== 1 ? "s" : ""}
          </div>
          {org.admins.length > 0 && (
            <div className="text-xs text-muted-foreground truncate" title={org.admins.map((a) => a.email ?? "unknown").join(", ")}>
              {org.admins[0].email ?? "unknown"}
              {org.admins.length > 1 && <span className="text-muted-foreground"> +{org.admins.length - 1} more</span>}
            </div>
          )}
        </div>
        <button
          onClick={() => { setEditing((v) => !v); setExpanded(true); }}
          title="Edit organization"
          className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="border-t px-5 py-5 space-y-6">
          {/* Edit org name/slug */}
          {editing && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <h4 className="text-sm font-medium">Edit organization</h4>
              <div className="flex flex-wrap gap-2">
                <input
                  className={cn(inputCls, "flex-1 min-w-48")}
                  value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Organization name"
                />
                <input
                  className={cn(inputCls, "w-40")}
                  value={editSlug} onChange={(e) => setEditSlug(e.target.value)} placeholder="Slug (optional)"
                />
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button onClick={() => { setEditing(false); setEditName(org.name); setEditSlug(org.slug ?? ""); }}
                  className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Workspaces IN this org */}
          <div className="rounded-lg border bg-muted/40 p-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" /> Workspaces in this organization
            </h4>
            {org.workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-3">No workspaces yet — invite a new one below, or pull in an existing standalone workspace.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {org.workspaces.map((ws) => (
                  <div key={ws.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{ws.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{ws.owner_email ?? "no owner"}</span>
                    <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {ws.user_count}</span>
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {ws.quote_count}</span>
                    </span>
                    <button
                      onClick={() => handleRemoveWorkspace(ws.id, ws.name)}
                      title="Remove from organization"
                      className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Invite a NEW workspace into the org */}
            {!showNewWs ? (
              <button
                onClick={() => setShowNewWs(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
              >
                <Plus className="w-3.5 h-3.5" /> Invite new workspace
              </button>
            ) : (
              <form onSubmit={handleCreateWorkspace} className="rounded-md border bg-card p-4 space-y-3 shadow-sm">
                <h5 className="text-sm font-medium">New workspace in {org.name}</h5>
                <p className="text-xs text-muted-foreground">Creates a brand-new workspace already linked to this org and emails its owner an invite.</p>
                <div className="flex flex-wrap gap-2">
                  <input className={cn(inputCls, "flex-1 min-w-40")} required placeholder="Workspace / company name"
                    value={wsCompany} onChange={(e) => setWsCompany(e.target.value)} />
                  <input className={cn(inputCls, "flex-1 min-w-40")} type="email" required placeholder="Owner email"
                    value={wsOwnerEmail} onChange={(e) => setWsOwnerEmail(e.target.value)} />
                  <input className={cn(inputCls, "flex-1 min-w-32")} placeholder="Owner name (optional)"
                    value={wsOwnerName} onChange={(e) => setWsOwnerName(e.target.value)} />
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowNewWs(false)} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancel</button>
                  <button type="submit" disabled={creatingWs}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {creatingWs && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Create & invite owner
                  </button>
                </div>
              </form>
            )}

            {/* Pull in an EXISTING standalone workspace */}
            {standaloneWorkspaces.length > 0 && (
              <form onSubmit={handleAssign} className="flex gap-2 mt-3">
                <select className={cn(inputCls, "flex-1")} value={assignId} onChange={(e) => setAssignId(e.target.value)} required>
                  <option value="">Or add an existing standalone workspace…</option>
                  {standaloneWorkspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
                <button type="submit" disabled={assigning || !assignId}
                  className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  {assigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Add
                </button>
              </form>
            )}
          </div>

          {/* Org Admins */}
          <div className="rounded-lg border bg-muted/40 p-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><UserPlus className="w-4 h-4" /> Org Admins</h4>

            {/* Enrolled admins (source of truth = organization_admins) */}
            {org.admins.length > 0 && (
              <div className="mb-3 space-y-1">
                {org.admins.map((a) => (
                  <div key={a.user_id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{a.email ?? <span className="text-muted-foreground italic">unknown email</span>}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300">Active</span>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleInvite} className="flex flex-wrap gap-2">
              <input className={cn(inputCls, "flex-1 min-w-48")} type="email" required placeholder="Email address"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <input className={cn(inputCls, "flex-1 min-w-32")} placeholder="Full name (optional)"
                value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              <button type="submit" disabled={inviting}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {inviting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Invite admin
              </button>
            </form>

            {loadingInvites ? (
              <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
            ) : invites.filter((i) => i.status !== "accepted").length > 0 && (
              <div className="mt-3 space-y-1">
                {invites.filter((i) => i.status !== "accepted").map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm shadow-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{inv.email}{inv.full_name && <span className="text-muted-foreground ml-1">({inv.full_name})</span>}</span>
                    <InviteStatusBadge status={inv.status} />
                    <span className="text-xs text-muted-foreground">{fmtDate(inv.created_at)}</span>
                    {inv.status === "pending" && (
                      <div className="flex gap-1">
                        <button onClick={() => handleInviteAction(inv.id, "resend")} disabled={actionId === inv.id} title="Resend"
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-50">
                          {actionId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleInviteAction(inv.id, "revoke")} disabled={actionId === inv.id} title="Revoke"
                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-50">
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrganizationsSection({
  orgs,
  standaloneWorkspaces,
}: {
  orgs: OrgRow[];
  standaloneWorkspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/admin/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug || undefined }),
    });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) { toast.error(j.error ?? "Failed to create organization"); return; }
    toast.success(`Organization "${j.org.name}" created`);
    setName(""); setSlug(""); setCreating(false);
    router.refresh();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-semibold">Organizations</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{orgs.length}</span>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90">
            <Building2 className="w-3.5 h-3.5" /> New organization
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        A brand/reseller umbrella grouping multiple Workspaces under one Org Admin. Optional — direct customers stay standalone.
      </p>

      {creating && (
        <form onSubmit={handleCreate} className="mb-4 rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-medium">Create organization</h3>
          <div className="flex gap-2">
            <input className={cn(inputCls, "flex-1")} required placeholder="Organization name (e.g. CMIT, TeamLogic)"
              value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <input className={cn(inputCls, "w-40")} placeholder="Slug (optional)"
              value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setCreating(false)} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      )}

      {orgs.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
          No organizations yet. Create one to group Workspaces under a shared brand and billing umbrella.
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} standaloneWorkspaces={standaloneWorkspaces} />
          ))}
        </div>
      )}
    </section>
  );
}
