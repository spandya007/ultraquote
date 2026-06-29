import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ArrowLeft } from "lucide-react";
import { getOrgAdminUser } from "@/lib/org-admin";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IdleTimeout } from "@/components/auth/idle-timeout";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Organization console — deliberately outside the tenant dashboard shell,
// built the same way as /admin (service-role queries, own layout).
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const orgAdmin = await getOrgAdminUser();
  if (!orgAdmin) redirect("/");

  // 2FA gate (same as dashboard + admin layouts).
  let needsMfa = false;
  try {
    const supabase = await createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsMfa = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2";
  } catch { /* ignore */ }
  if (needsMfa) redirect("/auth/mfa");

  const admin = createAdminClient();

  const [orgRes, tenantUserRes] = await Promise.all([
    admin.from("organizations").select("name").eq("id", orgAdmin.orgId).maybeSingle(),
    // Check if this user also has a Workspace (dual-hat).
    admin.from("users").select("id").eq("id", orgAdmin.user.id).maybeSingle(),
  ]);

  const orgName = orgRes.data?.name ?? "Organization";
  const hasWorkspace = Boolean(tenantUserRes.data);

  return (
    <div className="min-h-screen bg-muted/20">
      <IdleTimeout />
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h1 className="font-semibold">{orgName}</h1>
            <span className="text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 px-2 py-0.5 rounded">
              Org Admin
            </span>
          </div>
          <div className="flex items-center gap-5">
            {hasWorkspace && (
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" /> Back to workspace
              </Link>
            )}
            <ThemeToggle className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" />
            <SignOutButton className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
