import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Per-request deduped auth lookup. React `cache()` memoises the validated user
// for a single server render so the dashboard layout and the page rendering
// inside it share ONE auth validation instead of each calling getUser().
// Middleware runs in a separate pass and is intentionally not deduped here.
//
// Kept separate from user-context.ts because this imports the server client
// (next/headers), which must not be pulled into client bundles.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
