import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient, type AdminTenantRow } from "@/components/admin/admin-client";
import type { TenantInvite, User } from "@/types";

export const dynamic = "force-dynamic";

interface TenantRowDb { id: string; name: string; email: string | null; created_at: string }

export default async function AdminPage() {
  const admin = createAdminClient();

  const [tenantsRes, usersRes, quotesRes, invitesRes] = await Promise.all([
    admin.from("tenants").select("id, name, email, created_at").order("created_at"),
    admin.from("users").select("id, tenant_id, email, full_name, role"),
    admin.from("quotes").select("id, tenant_id"),
    admin.from("tenant_invites").select("*").order("created_at", { ascending: false }),
  ]);

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
    };
  });

  return <AdminClient tenants={rows} />;
}
