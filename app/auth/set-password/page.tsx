import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";

// Landing page for invite links: /api/auth/callback?next=/auth/set-password
// exchanged the code for a session, so the invited user is signed in here and
// just needs to choose a password.
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=invite_link_expired");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: tenant } = await db
    .from("tenants")
    .select("name")
    .single(); // RLS limits to the invited user's tenant

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Welcome to UltraQuote</h1>
          <p className="text-sm text-muted-foreground">
            You’ve been invited to <span className="font-medium text-foreground">{tenant?.name ?? "your team"}</span>.
            Set a password to finish creating your account.
          </p>
        </div>
        <SetPasswordForm email={user.email ?? ""} />
      </div>
    </div>
  );
}
