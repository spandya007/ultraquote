"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Loader2, Mail, RotateCw, Users, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { TenantInvite, User } from "@/types";

// Settings → Team: list the tenant's users + pending invites; owners can
// invite/resend/revoke members. The user count shown here is the future
// billing basis (count of public.users rows in the tenant).
export function TeamCard() {
  const toast = useToast();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<TenantInvite[]>([]);
  const [myId, setMyId] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMyId(user.id);
    const [{ data: userRows }, { data: inviteRows }] = await Promise.all([
      db.from("users").select("*").order("created_at"),
      db.from("tenant_invites").select("*").order("created_at", { ascending: false }),
    ]);
    setUsers(userRows ?? []);
    setInvites(inviteRows ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const me = users.find((u) => u.id === myId);
  const isOwner = me?.role === "owner";
  // A pending invite's auth user already has a users row — don't double-list it.
  const pendingInvites = invites.filter((i) => i.status === "pending");
  const pendingEmails = new Set(pendingInvites.map((i) => i.email.toLowerCase()));
  const activeUsers = users.filter((u) => !pendingEmails.has(u.email.toLowerCase()));

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, full_name: inviteName }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Invite failed");
        return;
      }
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail(""); setInviteName("");
      load();
    } finally {
      setInviting(false);
    }
  }

  async function setMemberEnabled(target: User, enabled: boolean) {
    if (!enabled && !window.confirm(`Disable ${target.full_name || target.email}? They'll be blocked from UltraQuote until you re-enable them. Their quotes are kept.`)) return;
    setActionId(target.id);
    try {
      const res = await fetch(`/api/team/members/${target.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed"); return; }
      toast.success(enabled ? "Member re-enabled" : "Member disabled");
      load();
    } finally {
      setActionId(null);
    }
  }

  async function inviteAction(invite: TenantInvite, action: "resend" | "revoke") {
    if (action === "revoke" && !window.confirm(`Revoke the invite for ${invite.email}?`)) return;
    setActionId(invite.id);
    try {
      const res = await fetch(`/api/team/invites/${invite.id}`, {
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
      load();
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <span className="text-muted-foreground"><Users className="w-4 h-4" /></span>
        <h2 className="font-semibold text-base">Team</h2>
        {!loading && (
          <span className="text-sm text-muted-foreground">
            {activeUsers.length} {activeUsers.length === 1 ? "user" : "users"}
            {pendingInvites.length > 0 && ` · ${pendingInvites.length} pending`}
          </span>
        )}
      </div>
      <div className="px-6 py-5 space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading team…
          </div>
        ) : (
          <>
            <ul className="divide-y">
              {activeUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">
                      {u.full_name || u.email}
                      {u.id === myId && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </div>
                    {u.full_name && <div className="text-xs text-muted-foreground">{u.email}</div>}
                  </div>
                  <span className="flex items-center gap-1.5">
                    {u.role === "owner" && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">
                        owner
                      </span>
                    )}
                    {u.enabled === false ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                        disabled
                      </span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300">
                        active
                      </span>
                    )}
                    {/* Owner can pause/restore members (not owners, not self) */}
                    {isOwner && u.role !== "owner" && u.id !== myId && (
                      u.enabled === false ? (
                        <button
                          onClick={() => setMemberEnabled(u, true)}
                          disabled={actionId === u.id}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                          title="Restore this member's access"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Enable
                        </button>
                      ) : (
                        <button
                          onClick={() => setMemberEnabled(u, false)}
                          disabled={actionId === u.id}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 text-xs hover:bg-destructive/10 disabled:opacity-50"
                          title="Block this member's access (keeps their quotes)"
                        >
                          <Ban className="w-3 h-3" /> Disable
                        </button>
                      )
                    )}
                  </span>
                </li>
              ))}
              {pendingInvites.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{i.full_name || i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.full_name ? `${i.email} · ` : ""}invited {new Date(i.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      pending
                    </span>
                    {isOwner && (
                      <>
                        <button
                          onClick={() => inviteAction(i, "resend")}
                          disabled={actionId === i.id}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                          title="Delete the unaccepted invite and send a fresh one"
                        >
                          <RotateCw className="w-3 h-3" /> Resend
                        </button>
                        <button
                          onClick={() => inviteAction(i, "revoke")}
                          disabled={actionId === i.id}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 text-xs hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" /> Revoke
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {isOwner && (
              <form onSubmit={inviteMember} className="border-t pt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="teammate@yourcompany.com"
                  />
                  <input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Name (optional)"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    They’ll get an email invite to join your workspace as a member.
                  </p>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Invite member
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
