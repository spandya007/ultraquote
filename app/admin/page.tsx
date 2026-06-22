import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient, type AdminTenantRow } from "@/components/admin/admin-client";
import { BetaSignupsCard, type BetaSignupRow } from "@/components/admin/beta-signups-card";
import type { TenantInvite, User } from "@/types";

export const dynamic = "force-dynamic";

interface TenantRowDb {
  id: string; name: string; email: string | null; created_at: string;
  subscription_start: string | null; subscription_end: string | null;
  subscription_term: string | null; platform_enabled: boolean; suspended_reason: string | null;
}

export default async function AdminPage() {
  const admin = createAdminClient();

  const [tenantsRes, usersRes, quotesRes, invitesRes, betaRes] = await Promise.all([
    admin.from("tenants").select(
      "id, name, email, created_at, subscription_start, subscription_end, subscription_term, platform_enabled, suspended_reason"
    ).order("created_at"),
    admin.from("users").select("id, tenant_id, email, full_name, role"),
    admin.from("quotes").select("id, tenant_id"),
    admin.from("tenant_invites").select("*").order("created_at", { ascending: false }),
    // Missing table (migration 017 not yet run) returns an error, not a throw —
    // `?? []` degrades gracefully to an empty list.
    admin
      .from("beta_signups")
      .select("id, company_name, contact_name, email, message, created_at, invited_at, status")
      .order("created_at", { ascending: false }),
  ]);

  const betaSignups = (betaRes.data ?? []) as BetaSignupRow[];

  const tenants = (tenantsRes.data ?? []) as TenantRowDb[];
  const users = (usersRes.data ?? []) as Pick<User, "id" | "tenant_id" | "email" | "full_name" | "role">[];
  const quotes = (quotesRes.data ?? []) as { id: string; tenant_id: string }[];
  const invites = (invitesRes.data ?? []) as TenantInvite[];

  const rows: AdminTenantRow[] = tenants.map((t) => {
    const tenantUsers = users.filter((u) => u.tenant_id === t.id);
    const owner = tenantUsers.find((u) => u.role === "owner") ?? null;
    // invites are sorted newest-first, so find() = latest owner invite
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
    };
  });

  return (
    <div className="space-y-8">
      <AdminClient tenants={rows} />
      <BetaSignupsCard signups={betaSignups} />
    </div>
  );
}
