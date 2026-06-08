import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Tenant branding for the sidebar (name + logo).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: userData } = await db.from("users").select("tenant_id").eq("id", user.id).single();
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar brandName={brandName} logoUrl={logoUrl} />
      <main className="flex-1 overflow-y-auto bg-muted/20">
        {children}
      </main>
    </div>
  );
}
