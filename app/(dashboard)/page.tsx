import { createClient } from "@/lib/supabase/server";
import { RefreshOnMount } from "@/components/ui/refresh-on-mount";
import { isStaleDraft } from "@/lib/quote-status";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { DashboardClient, type QuoteRow } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: quotesRaw }, { count: clientCount }, { data: settings }, { count: productCount }, { data: tenant }, { data: me }] = await Promise.all([
    db.from("quotes").select(`
      id, quote_number, title, status, valid_until, created_at, updated_at,
      client:clients(company_name),
      scenarios:quote_scenarios!quote_id(is_recommended, sort_order, monthly_recurring_total, onetime_total, total)
    `).order("created_at", { ascending: false }),
    db.from("clients").select("*", { count: "exact", head: true }).eq("is_active", true),
    db.from("tenant_settings").select("default_valid_days").maybeSingle(),
    db.from("products").select("*", { count: "exact", head: true }),
    db.from("tenants").select("logo_url").maybeSingle(),
    db.from("users").select("role").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  const validDays: number = settings?.default_valid_days ?? 30;
  // Hide stale drafts (inactive > Default Valid Days) before handing off to the
  // client; the client owns the date-range filtering + all metric computation.
  const quotes: QuoteRow[] = ((quotesRaw ?? []) as QuoteRow[]).filter((q) => !isStaleDraft(q, validDays));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <RefreshOnMount />
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your pipeline at a glance</p>
      </div>

      <OnboardingChecklist
        isOwner={me?.role === "owner"}
        steps={{
          logo: !!tenant?.logo_url,
          products: (productCount ?? 0) > 0,
          clients: (clientCount ?? 0) > 0,
          quotes: quotes.length > 0,
        }}
      />

      <DashboardClient quotes={quotes} clientCount={clientCount ?? 0} />
    </div>
  );
}
