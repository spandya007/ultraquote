import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/ui/sidebar";
import { IdleTimeout } from "@/components/auth/idle-timeout";
import { ContextualHelp } from "@/components/help/contextual-help";
import { getAccessState } from "@/lib/access/access-state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUserContext } from "@/lib/auth/user-context";
import { SubscriptionBanner } from "@/components/account/subscription-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  // Resolve the independent gates/lookups in parallel rather than serially.
  // getAccessState + getUserContext share a per-request cached fetch, so the
  // user+tenant row loads ONCE even though both rely on it.
  const [aalRes, access, ctx, platformAdminRes] = await Promise.all([
    // An AAL lookup hiccup must never lock anyone out — swallow errors to null.
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null),
    getAccessState(user.id),
    getUserContext(user.id),
    // Platform-admin check (service role: platform_admins has no client policies).
    createAdminClient().from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  // 2FA gate: enrolled factor but session still AAL1 → challenge before any app
  // page. redirect() throws internally, so call it OUTSIDE any try/catch.
  const aal = aalRes?.data;
  const needsMfa = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  if (needsMfa) redirect("/auth/mfa");

  // Subscription / access gate (after MFA). Hard-block suspended/expired/disabled;
  // `grace` passes through but is surfaced as a read-only banner (writes blocked
  // at the API layer). See docs/subscription-and-access-lifecycle-design.md (§4).
  if (access.status === "suspended") redirect("/account/suspended?reason=suspended");
  if (access.status === "expired") redirect(`/account/suspended?reason=expired&role=${access.role}`);
  if (access.status === "user_disabled") redirect("/account/disabled");

  // Legal gate: require acceptance of the Terms of Service + Privacy Policy
  // before using the app. /account/accept-terms lives outside this layout, so it
  // isn't re-gated (no redirect loop). redirect() throws — call outside try.
  if (ctx && !ctx.legal_accepted_at) redirect("/account/accept-terms");

  // Tenant branding for the sidebar (name + logo), from the shared context.
  const firstName: string =
    (ctx?.full_name as string | null)?.trim().split(/\s+/)[0] ||
    user.email?.split("@")[0] ||
    "";
  let brandName = "";
  let logoUrl: string | null = null;
  if (ctx?.tenant) {
    brandName = ctx.tenant.name ?? "";
    const stored: string | null = ctx.tenant.logo_url ?? null;
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

  const platformAdmin = platformAdminRes.data;

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
