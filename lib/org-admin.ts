import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User as AuthUser } from "@supabase/supabase-js";

// Returns the logged-in auth user + their org_id only if they are an Org Admin.
// organization_admins has RLS enabled with no policies, so membership can only
// be checked with the service-role client — mirrors getPlatformAdminUser().
export async function getOrgAdminUser(): Promise<{ user: AuthUser; orgId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_admins")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ? { user, orgId: data.org_id as string } : null;
}
