import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient, type AdminTenantRow } from "@/components/admin/admin-client";
import { BetaSignupsCard, type BetaSignupRow } from "@/components/admin/beta-signups-card";
import { OrganizationsSection, type OrgRow } from "@/components/admin/organizations-section";
import type { TenantInvite, User } from "@/types";

export const dynamic = "force-dynamic";

interface TenantRowDb {
  id: string; name: string; email: string | null; created_at: string;
  subscription_start: string | null; subscription_end: string | null;
  subscription_term: string | null; platform_enabled: boolean;
  suspended_reason: string | null; organization_id: string | null;
  created_by_org_admin_user: string | null;
}

export default async function AdminPage() {
  const admin = createAdminClient();

  const [tenantsRes, usersRes, quotesRes, invitesRes, betaRes, orgsRes, orgAdminsRes] = await Promise.all([
    admin.from("tenants").select(
      "id, name, email, created_at, subscription_start, subscription_end, subscription_term, platform_enabled, suspended_reason, organization_id, created_by_org_admin_user"
    ).order("created_at"),
    admin.from("users").select("id, tenant_id, email, full_name, role"),
    admin.from("quotes").select("id, tenant_id"),
    admin.from("tenant_invites").select("*").order("created_at", { ascending: false }),
    // beta_signups: missing table degrades gracefully (`?? []`).
    admin
      .from("beta_signups")
      .select("id, company_name, contact_name, email, message, created_at, invited_at, status")
      .order("created_at", { ascending: false }),
    // Organizations (migration 019 — `?? []` if not yet run).
    admin.from("organizations").select("id, name, slug, platform_enabled, created_at").order("created_at"),
    admin.from("organization_admins").select("org_id, user_id"),
  ]);

  const betaSignups = (betaRes.data ?? []) as BetaSignupRow[];
  const tenants = (tenantsRes.data ?? []) as TenantRowDb[];
  const users = (usersRes.data ?? []) as Pick<User, "id" | "tenant_id" | "email" | "full_name" | "role">[];
  const quotes = (quotesRes.data ?? []) as { id: string; tenant_id: string }[];
  const invites = (invitesRes.data ?? []) as TenantInvite[];
  const rawOrgs = (orgsRes.data ?? []) as { id: string; name: string; slug: string | null; platform_enabled: boolean; created_at: string }[];
  const orgAdmins = (orgAdminsRes.data ?? []) as { org_id: string; user_id: string }[];

  // Org id → name, for the Tenants-list Organization badge.
  const orgNameById = new Map(rawOrgs.map((o) => [o.id, o.name]));

  const rows: AdminTenantRow[] = tenants.map((t) => {
    const tenantUsers = users.filter((u) => u.tenant_id === t.id);
    const owner = tenantUsers.find((u) => u.role === "owner") ?? null;
    const ownerInvite = invites.find((i) => i.tenant_id === t.id && i.role === "owner") ?? null;
    return {
      id: t.id,
      name: t.name,
      contact_email: t.email,
      created_at: t.created_at,
      user_count: tenantUsers.length,
      quote_count: quotes.filter((q) => q.tenant_id === t.id).length,
      owner_email: owner?.email ?? null,
      owner_name: owner?.full_name ?? null,
      invite: ownerInvite,
      subscription_start: t.subscription_start,
      subscription_end: t.subscription_end,
      subscription_term: (t.subscription_term as AdminTenantRow["subscription_term"]) ?? null,
      platform_enabled: t.platform_enabled ?? true,
      suspended_reason: t.suspended_reason,
      organization_id: t.organization_id,
      organization_name: t.organization_id ? orgNameById.get(t.organization_id) ?? null : null,
      created_by_org_admin: Boolean(t.created_by_org_admin_user),
    };
  });

  // Resolve enrolled Org Admins (organization_admins.user_id) → auth emails.
  // This is the source of truth for "who is an admin" — including admins added
  // directly (e.g. via SQL) with no org_admin_invites row.
  const adminUserIds = [...new Set(orgAdmins.map((a) => a.user_id))];
  const adminEmailEntries = await Promise.all(
    adminUserIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      return [uid, data?.user?.email ?? null] as const;
    })
  );
  const adminEmailById = new Map(adminEmailEntries);

  const orgRows: OrgRow[] = rawOrgs.map((o) => {
    const memberWorkspaces = tenants.filter((t) => t.organization_id === o.id);
    return {
      ...o,
      workspace_count: memberWorkspaces.length,
      admin_count: orgAdmins.filter((a) => a.org_id === o.id).length,
      admins: orgAdmins
        .filter((a) => a.org_id === o.id)
        .map((a) => ({ user_id: a.user_id, email: adminEmailById.get(a.user_id) ?? null })),
      // Workspaces ALREADY in this org (shown in the card, with owner + counts).
      workspaces: memberWorkspaces.map((t) => {
        const owner = users.find((u) => u.tenant_id === t.id && u.role === "owner");
        return {
          id: t.id,
          name: t.name,
          owner_email: owner?.email ?? null,
          user_count: users.filter((u) => u.tenant_id === t.id).length,
          quote_count: quotes.filter((q) => q.tenant_id === t.id).length,
        };
      }),
    };
  });

  // Standalone = not yet in any org. Offered in the "Assign existing" dropdown.
  const standaloneWorkspaces = tenants
    .filter((t) => !t.organization_id)
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-8">
      <AdminClient tenants={rows} />
      <OrganizationsSection orgs={orgRows} standaloneWorkspaces={standaloneWorkspaces} />
      <BetaSignupsCard signups={betaSignups} />
    </div>
  );
}
