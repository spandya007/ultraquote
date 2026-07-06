import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "@/components/auth/signup-form";

export const dynamic = "force-dynamic";

// Public self-serve signup. Middleware allowlists /signup; a logged-in visitor is
// bounced to the dashboard.
export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <SignupForm />
    </div>
  );
}
