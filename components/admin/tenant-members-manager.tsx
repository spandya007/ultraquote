"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Crown, UserMinus, Trash2, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

export interface MemberRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  enabled: boolean;
}

type Action = "make_owner" | "make_member" | "remove" | "delete_account";

export function TenantMembersManager({
  tenantId,
  members,
}: {
  tenantId: string;
  members: MemberRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const ownerCount = members.filter((m) => m.role === "owner").length;

  async function run(userId: string, action: Action, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(userId);
    const res = await fetch(`/api/admin/tenants/${tenantId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json();
    setBusyId(null);
    if (!res.ok) { toast.error(j.error ?? "Action failed"); return; }
    toast.success("Done");
    router.refresh();
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold text-base">
        <Users className="w-4 h-4 text-muted-foreground" /> Team members ({members.length})
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Transfer ownership (promote a new owner, then demote/remove the old one) or offboard someone who has
        left. The last owner can&apos;t be removed or demoted — promote a replacement first.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const busy = busyId === m.id;
              const isOwner = m.role === "owner";
              const isLastOwner = isOwner && ownerCount <= 1;
              return (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.full_name ?? m.email}</div>
                    {m.full_name && <div className="text-xs text-muted-foreground">{m.email}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      isOwner
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {isOwner && <Crown className="w-3 h-3" />} {m.role}
                    </span>
                    {!m.enabled && <span className="ml-1 text-xs text-red-600 dark:text-red-400">disabled</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                      {isOwner ? (
                        <button
                          onClick={() => run(m.id, "make_member", isLastOwner ? undefined : `Demote ${m.email} to member?`)}
                          disabled={busy || isLastOwner}
                          title={isLastOwner ? "Can't demote the only owner" : "Demote to member"}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                        >
                          <ChevronDown className="w-3.5 h-3.5" /> Make member
                        </button>
                      ) : (
                        <button
                          onClick={() => run(m.id, "make_owner", `Promote ${m.email} to owner?`)}
                          disabled={busy}
                          title="Promote to owner"
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                        >
                          <ChevronUp className="w-3.5 h-3.5" /> Make owner
                        </button>
                      )}
                      <button
                        onClick={() => run(m.id, "remove", `Remove ${m.email} from this workspace? Their login is kept (not deleted).`)}
                        disabled={busy || isLastOwner}
                        title={isLastOwner ? "Can't remove the only owner" : "Remove from workspace (keep login)"}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                      >
                        <UserMinus className="w-3.5 h-3.5" /> Remove
                      </button>
                      <button
                        onClick={() => run(m.id, "delete_account", `Permanently DELETE ${m.email}'s account (login + workspace membership)? This cannot be undone.`)}
                        disabled={busy || isLastOwner}
                        title={isLastOwner ? "Can't delete the only owner" : "Delete account entirely"}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 text-xs hover:bg-destructive/10 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
