import { SignOutButton } from "@/components/auth/sign-out-button";

// Block landing for a user disabled by their tenant owner (users.enabled=false).
// Lives outside the (dashboard) group so it isn't re-gated.
export default function DisabledPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl dark:bg-red-500/15">
          🚫
        </div>
        <h1 className="text-xl font-semibold">Access disabled</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your access to SmartProps has been turned off by your account owner. Please contact your
          administrator if you think this is a mistake.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
