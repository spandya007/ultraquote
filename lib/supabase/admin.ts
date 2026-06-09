import { createClient } from "@supabase/supabase-js";

// Service-role client for trusted server contexts with no user session
// (e.g. webhooks). Bypasses RLS — never expose to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
