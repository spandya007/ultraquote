import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUserContext } from "@/lib/auth/user-context";
import { AcceptTermsForm } from "@/components/account/accept-terms-form";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Legal acceptance gate. Lives OUTSIDE the (dashboard) group so the dashboard
// layout's gate doesn't redirect here in a loop. The dashboard layout sends
// users here when users.legal_accepted_at is null.
export const dynamic = "force-dynamic";

export default async function AcceptTermsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Already accepted → straight into the app.
  const ctx = await getUserContext(user.id);
  if (ctx?.legal_accepted_at) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Before you continue</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          To use UltraQuote, please review and accept our Terms of Service and Privacy Policy.
          UltraQuote is currently offered as a free evaluation — these terms explain how the
          service is provided and how we handle data.
        </p>

        <div className="mt-6">
          <AcceptTermsForm />
        </div>

        <div className="mt-6 border-t pt-4 text-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
