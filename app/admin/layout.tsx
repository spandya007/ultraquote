import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createClient } from "@/lib/supabase/server";

// Platform-level console — deliberately outside the tenant dashboard shell.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) redirect("/");

  // Same 2FA gate as the dashboard (this layout is a separate route).
  let needsMfa = false;
  try {
    const supabase = await createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsMfa = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  } catch { /* ignore */ }
  if (needsMfa) redirect("/auth/mfa");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-violet-600" />
            <h1 className="font-semibold">Platform Admin</h1>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Back to app
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
