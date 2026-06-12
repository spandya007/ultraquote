import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/settings/settings-client";
import { TeamCard } from "@/components/settings/team-card";
import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { AppearanceCard } from "@/components/settings/appearance-card";

export default async function SettingsPage() {
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

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your company profile and quote defaults.
        </p>
      </div>
      <SettingsClient
        tenantId={tenantId}
        tenant={tenant}
        settings={settings}
        isOwner={isOwner}
      />
      <AppearanceCard />
      <TeamCard />
      <ChangePasswordCard />
    </div>
  );
}
