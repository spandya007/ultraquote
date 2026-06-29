import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgAdminUser } from "@/lib/org-admin";
import { OrgClient } from "@/components/org/org-client";
import type { SubscriptionTerm } from "@/types";

export const dynamic = "force-dynamic";

export interface OrgWorkspaceRow {
  id: string;
  name: string;
  owner_email: string | null;
  owner_name: string | null;
  user_count: number;
  quote_count: number;
  subscription_end: string | null;
  subscription_term: SubscriptionTerm | null;
  platform_enabled: boolean;
  created_at: string;
}

export interface OrgAdminRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

export interface OrgAdminInviteRow {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
  accepted_at: string | null;
}

export default async function OrgPage() {
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) redirect("/");

  const admin = createAdminClient();
  const { orgId } = orgAdmin;

  const [tenantsRes, usersRes, quotesRes, invitesRes, orgAdminsRes] = await Promise.all([
    admin
      .from("tenants")
      .select("id, name, created_at, subscription_end, subscription_term, platform_enabled")
      .eq("organization_id", orgId)
      .order("name"),
    admin.from("users").select("id, tenant_id, email, full_name, role"),
    admin.from("quotes").select("id, tenant_id"),
    admin
      .from("org_admin_invites")
      .select("id, email, full_name, status, created_at, accepted_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    admin.from("organization_admins").select("user_id, created_at").eq("org_id", orgId),
  ]);

  const tenants = tenantsRes.data ?? [];
  const users = usersRes.data ?? [];
  const quotes = quotesRes.data ?? [];

  const workspaces: OrgWorkspaceRow[] = tenants.map((t) => {
    const ws_users = users.filter((u) => u.tenant_id === t.id);
    const owner = ws_users.find((u) => u.role === "owner") ?? null;
    return {
      id: t.id,
      name: t.name,
      owner_email: owner?.email ?? null,
      owner_name: owner?.full_name ?? null,
      user_count: ws_users.length,
      quote_count: quotes.filter((q) => q.tenant_id === t.id).length,
      subscription_end: t.subscription_end,
      subscription_term: t.subscription_term as SubscriptionTerm | null,
      platform_enabled: t.platform_enabled ?? true,
      created_at: t.created_at,
    };
  });

  // Resolve auth user emails for enrolled admins.
  const adminRows: OrgAdminRow[] = await Promise.all(
    (orgAdminsRes.data ?? []).map(async (a) => {
      const { data: authRes } = await admin.auth.admin.getUserById(a.user_id);
      return {
        user_id: a.user_id,
        email: authRes?.user?.email ?? null,
        full_name: (authRes?.user?.user_metadata?.full_name as string | null) ?? null,
        created_at: a.created_at,
      };
    })
  );

  const pendingInvites: OrgAdminInviteRow[] = (invitesRes.data ?? []).filter(
    (i) => i.status !== "accepted"
  );

  return (
    <OrgClient
      workspaces={workspaces}
      admins={adminRows}
      pendingInvites={pendingInvites}
      orgId={orgId}
    />
  );
}
