import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/ui/sidebar";
import { IdleTimeout } from "@/components/auth/idle-timeout";
import { ContextualHelp } from "@/components/help/contextual-help";
import { getAccessState } from "@/lib/access/access-state";
import { SubscriptionBanner } from "@/components/account/subscription-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 2FA gate: if the user has an enrolled factor but this session is still AAL1,
  // send them to the challenge before any app page. Compute the flag inside the
  // try (so an AAL lookup hiccup never locks anyone out), but redirect OUTSIDE
  // it — redirect() throws internally and must not be caught.
  let needsMfa = false;
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsMfa = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  } catch { /* ignore */ }
  if (needsMfa) redirect("/auth/mfa");

  // Subscription / access gate (after MFA). Resolve the effective state and
  // hard-block suspended/expired/disabled users; `grace` passes through but is
  // surfaced as a read-only banner (writes are blocked at the API layer).
  // See docs/subscription-and-access-lifecycle-design.md (§4).
  const access = await getAccessState(user.id);
  if (access.status === "suspended") redirect("/account/suspended?reason=suspended");
  if (access.status === "expired") redirect(`/account/suspended?reason=expired&role=${access.role}`);
  if (access.status === "user_disabled") redirect("/account/disabled");

  // Tenant branding for the sidebar (name + logo).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: userData } = await db.from("users").select("tenant_id, full_name").eq("id", user.id).single();
  const firstName: string =
    (userData?.full_name as string | null)?.trim().split(/\s+/)[0] ||
    user.email?.split("@")[0] ||
    "";
  let brandName = "";
  let logoUrl: string | null = null;
  if (userData?.tenant_id) {
    const { data: tenant } = await db
      .from("tenants").select("name, logo_url").eq("id", userData.tenant_id).single();
    brandName = tenant?.name ?? "";
    const stored: string | null = tenant?.logo_url ?? null;
    if (stored?.startsWith("sb-storage://")) {
      const rest = stored.slice("sb-storage://".length);
      const slash = rest.indexOf("/");
      const { data } = await supabase.storage
        .from(rest.slice(0, slash))
        .createSignedUrl(rest.slice(slash + 1), 60 * 60);
      logoUrl = data?.signedUrl ?? null;
    } else if (stored) {
      logoUrl = stored;
    }
  }

  // Platform-admin check (service role: platform_admins has no client policies).
  const { data: platformAdmin } = await createAdminClient()
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Expiry banner: read-only notice during grace, or an amber reminder in the
  // last 7 days before the subscription ends. (Hard-block states already
  // redirected above.)
  let banner: React.ComponentProps<typeof SubscriptionBanner> | null = null;
  const isOwner = access.status === "ok" || access.status === "grace" ? access.role === "owner" : false;
  if (access.status === "grace") {
    banner = { mode: "grace", endDate: access.subscriptionEnd, graceEndsOn: access.graceEndsOn, isOwner };
  } else if (access.status === "ok" && access.subscriptionEnd) {
    const end = new Date(`${access.subscriptionEnd}T00:00:00.000Z`).getTime();
    const today = Date.now();
    const days = Math.ceil((end - today) / 86_400_000);
    if (days >= 0 && days <= 7) {
      banner = { mode: "expiring", endDate: access.subscriptionEnd, daysToExpiry: days, isOwner };
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <IdleTimeout />
      <Sidebar brandName={brandName} logoUrl={logoUrl} showAdmin={Boolean(platformAdmin)} userName={firstName} />
      <main className="flex-1 overflow-y-auto bg-muted/20 pt-14 md:pt-0">
        {banner && <SubscriptionBanner {...banner} />}
        {children}
      </main>
      <ContextualHelp />
    </div>
  );
}
