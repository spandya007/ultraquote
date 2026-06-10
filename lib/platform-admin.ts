import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User as AuthUser } from "@supabase/supabase-js";

// Returns the logged-in auth user only if they are a platform admin.
// platform_admins has RLS enabled with no policies, so membership can only be
// checked with the service-role client — never from the browser.
export async function getPlatformAdminUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ? user : null;
}
