import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-request deduped tenant context.
//
// React `cache()` memoises this for the duration of a single server render, so
// the dashboard layout, the access resolver, AND the page that renders inside
// it all share ONE user+tenant fetch instead of each doing their own
// (previously the users/tenants rows were read ~3x per navigation).
//
// NOTE: this module must stay free of `next/headers` (no server-client import),
// because lib/access/access-state.ts imports it and is in turn pulled into a
// client bundle via subscription.ts → admin-client.tsx. Auth (getCurrentUser)
// therefore lives separately in lib/auth/current-user.ts.

export interface UserContext {
  tenant_id: string;
  role: "owner" | "member";
  full_name: string | null;
  enabled: boolean | null;
  // Full tenant row (joined), or null if the user has no tenant yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenant: any | null;
}

// The caller's own user row + their tenant in a SINGLE round-trip, via the
// service-role client. Keyed by the authenticated uid (passed by the caller
// after getCurrentUser), so it never exposes another tenant. Cached per request.
export const getUserContext = cache(async (userId: string): Promise<UserContext | null> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("users")
    .select("tenant_id, role, full_name, enabled, tenant:tenants(*)")
    .eq("id", userId)
    .maybeSingle();
  return (data as UserContext | null) ?? null;
});
