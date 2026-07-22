import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsClient } from "@/components/settings/settings-client";
import { TeamCard } from "@/components/settings/team-card";
import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { MfaCard } from "@/components/settings/mfa-card";
import { SubscriptionCard } from "@/components/settings/subscription-card";
import { WorkspaceSummaryCard } from "@/components/settings/workspace-summary-card";
import { IntegrationsCard } from "@/components/settings/integrations-card";
import { WebhooksCard } from "@/components/settings/webhooks-card";
import { getTenantDossier } from "@/lib/admin/tenant-dossier";
import { planHasFeature } from "@/lib/billing/entitlements";
import { getTenantConnections } from "@/lib/integrations/store";
import { listWebhooks } from "@/lib/webhooks/store";
import { planLabel } from "@/lib/billing/features";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ mfa?: string; integration?: string }>;
}) {
  const sp = await searchParams;
  const recovered = sp?.mfa === "recovered";
  const integrationReturn = sp?.integration;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: userData } = await db
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single() as { data: { tenant_id: string; role: "owner" | "member" } | null };

  if (!userData) return null;
  const tenantId = userData.tenant_id;
  const isOwner = userData.role === "owner";

  const [{ data: tenant }, { data: settings }] = await Promise.all([
    db.from("tenants").select("*").eq("id", tenantId).single(),
    db.from("tenant_settings").select("*").eq("tenant_id", tenantId).single(),
  ]);

  // Org-default Proposal Voice (for the "inherited when blank" preview). organizations
  // is RLS-locked (service-role only), so read via the admin client, scoped to the
  // tenant's own org. Null when the workspace isn't in an org.
  let orgVoiceDefaults: { businessType: string | null; businessAbout: string | null; brandVoice: string | null } | null = null;
  if (tenant?.organization_id) {
    const { data: org } = await createAdminClient()
      .from("organizations")
      .select("default_business_type, default_business_about, default_brand_voice")
      .eq("id", tenant.organization_id)
      .maybeSingle();
    if (org) {
      orgVoiceDefaults = {
        businessType:  org.default_business_type ?? null,
        businessAbout: org.default_business_about ?? null,
        brandVoice:    org.default_brand_voice ?? null,
      };
    }
  }

  // Owner-only "what's in your workspace" summary (keyed to the owner's own tenant).
  const dossier = isOwner ? await getTenantDossier(tenantId) : null;

  // Owner-only Integrations (gated by the 'integrations' plan entitlement).
  const tenantPlan = (tenant?.plan as string | undefined) ?? "beta";
  const integrationsEnabled = isOwner ? await planHasFeature(tenantPlan, "integrations") : false;
  const integrationConnections =
    isOwner && integrationsEnabled ? await getTenantConnections(tenantId) : [];
  const webhooks = isOwner && integrationsEnabled ? await listWebhooks(tenantId) : [];

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your company profile and proposal defaults.
        </p>
      </div>

      {recovered && (
        <div className="flex items-start gap-2.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 px-4 py-3 text-sm">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You signed in with a recovery code, so <strong>two-factor authentication was turned off</strong>.
            Re-enable it below (you’ll set up your authenticator again and get a fresh set of recovery codes) to stay protected.
          </span>
        </div>
      )}
      <SettingsClient
        tenantId={tenantId}
        tenant={tenant}
        settings={settings}
        isOwner={isOwner}
        orgVoiceDefaults={orgVoiceDefaults}
      />
      <AppearanceCard />
      {isOwner && tenant && (
        <SubscriptionCard
          start={tenant.subscription_start ?? null}
          end={tenant.subscription_end ?? null}
          term={tenant.subscription_term ?? null}
          platformEnabled={tenant.platform_enabled ?? true}
        />
      )}
      {isOwner && dossier && <WorkspaceSummaryCard dossier={dossier} />}
      {isOwner && (
        <IntegrationsCard
          enabled={integrationsEnabled}
          planName={planLabel(tenantPlan)}
          connections={integrationConnections}
          returnCode={integrationReturn}
        />
      )}
      {isOwner && integrationsEnabled && <WebhooksCard webhooks={webhooks} />}
      <TeamCard />
      <ChangePasswordCard />
      <MfaCard />
    </div>
  );
}
