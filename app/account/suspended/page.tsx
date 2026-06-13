import { SignOutButton } from "@/components/auth/sign-out-button";

// Hard-block landing for tenants that are suspended (platform switch off) or
// expired (past the read-only grace window). The dashboard layout redirects
// here; this page lives OUTSIDE the (dashboard) group so it isn't re-gated.
// Copy varies by ?reason and ?role. See docs/subscription-and-access-lifecycle-design.md (§4).
export default function SuspendedPage({
  searchParams,
}: {
  searchParams: { reason?: string; role?: string };
}) {
  const expired = searchParams.reason === "expired";
  const isOwner = searchParams.role === "owner";

  const title = expired ? "Subscription expired" : "Account suspended";
  const body = expired
    ? isOwner
      ? "Your UltraQuote subscription has ended and the grace period has passed. Contact UltraQuote to renew and restore access for your team."
      : "Your organization's UltraQuote subscription has ended. Please contact your account owner or UltraQuote to renew."
    : "Access to this UltraQuote account has been suspended. Please contact UltraQuote for assistance.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-500/15">
          ⏳
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{body}</p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
