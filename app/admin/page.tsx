import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient, type AdminTenantRow } from "@/components/admin/admin-client";
import { BetaSignupsCard, type BetaSignupRow } from "@/components/admin/beta-signups-card";
import { AiUsageCard, type AiUsageSummary } from "@/components/admin/ai-usage-card";
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

  // AI usage window (aggregated in JS below). ai_usage: missing table (migration
  // 024 not yet applied) degrades gracefully to [].
  const AI_USAGE_WINDOW_DAYS = 30;
  const aiUsageSince = new Date(Date.now() - AI_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [tenantsRes, usersRes, quotesRes, invitesRes, betaRes, orgsRes, orgAdminsRes, aiUsageRes] = await Promise.all([
    admin.from("tenants").select(
      "id, name, email, created_at, subscription_start, subscription_end, subscription_term, platform_enabled, suspended_reason, organization_id, created_by_org_admin_user"
    ).order("created_at"),
    admin.from("users").select("id, tenant_id, email, full_name, role, enabled"),
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
    admin
      .from("ai_usage")
      .select("tenant_id, kind, model, input_tokens, output_tokens, cache_read_input_tokens, cost_usd")
      .gte("created_at", aiUsageSince)
      .limit(50000),
  ]);

  const betaSignups = (betaRes.data ?? []) as BetaSignupRow[];
  const tenants = (tenantsRes.data ?? []) as TenantRowDb[];
  const users = (usersRes.data ?? []) as Pick<User, "id" | "tenant_id" | "email" | "full_name" | "role" | "enabled">[];
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
      members: tenantUsers.map((u) => ({
        id: u.id, email: u.email, full_name: u.full_name, role: u.role, enabled: u.enabled ?? true,
      })),
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
        .map((a) => {
          // Does this Org Admin also operate a workspace (dual-hat owner)?
          const membership = users.find((u) => u.id === a.user_id) ?? null;
          const ws = membership ? tenants.find((t) => t.id === membership.tenant_id) ?? null : null;
          return {
            user_id: a.user_id,
            email: adminEmailById.get(a.user_id) ?? null,
            workspace_tenant_id: membership?.tenant_id ?? null,
            workspace_name: ws?.name ?? null,
          };
        }),
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

  // ── AI usage summary (last N days), aggregated from the ai_usage ledger ─────
  const tenantNameById = new Map(tenants.map((t) => [t.id, t.name]));
  const usageRows = (aiUsageRes.data ?? []) as {
    tenant_id: string; kind: string; model: string;
    input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cost_usd: number | string;
  }[];
  const acc = { calls: 0, cost: 0, inTok: 0, outTok: 0, cacheRead: 0 };
  const byModel = new Map<string, { calls: number; cost: number }>();
  const byKind = new Map<string, { calls: number; cost: number }>();
  const byTenant = new Map<string, { calls: number; cost: number }>();
  for (const r of usageRows) {
    const cost = Number(r.cost_usd) || 0;
    acc.calls++; acc.cost += cost;
    acc.inTok += r.input_tokens || 0; acc.outTok += r.output_tokens || 0; acc.cacheRead += r.cache_read_input_tokens || 0;
    const m = byModel.get(r.model) ?? { calls: 0, cost: 0 }; m.calls++; m.cost += cost; byModel.set(r.model, m);
    const k = byKind.get(r.kind) ?? { calls: 0, cost: 0 }; k.calls++; k.cost += cost; byKind.set(r.kind, k);
    const t = byTenant.get(r.tenant_id) ?? { calls: 0, cost: 0 }; t.calls++; t.cost += cost; byTenant.set(r.tenant_id, t);
  }
  const aiUsage: AiUsageSummary = {
    windowDays: AI_USAGE_WINDOW_DAYS,
    totalCalls: acc.calls,
    totalCostUsd: acc.cost,
    totalInputTokens: acc.inTok,
    totalOutputTokens: acc.outTok,
    totalCacheReadTokens: acc.cacheRead,
    byModel: [...byModel.entries()].map(([model, v]) => ({ model, calls: v.calls, costUsd: v.cost })).sort((a, b) => b.costUsd - a.costUsd),
    byKind: [...byKind.entries()].map(([kind, v]) => ({ kind, calls: v.calls, costUsd: v.cost })).sort((a, b) => b.costUsd - a.costUsd),
    topTenants: [...byTenant.entries()]
      .map(([tenantId, v]) => ({ tenantId, name: tenantNameById.get(tenantId) ?? "—", calls: v.calls, costUsd: v.cost }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 10),
  };

  return (
    <div className="space-y-8">
      <AdminClient tenants={rows} />
      <AiUsageCard summary={aiUsage} />
      <OrganizationsSection orgs={orgRows} standaloneWorkspaces={standaloneWorkspaces} />
      <BetaSignupsCard signups={betaSignups} />
    </div>
  );
}
