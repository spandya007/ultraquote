import { createClient } from "@/lib/supabase/server";
import { QuotesClient } from "@/components/quotes/quotes-client";

export default async function QuotesPage() {
  const supabase = await createClient();

  const [{ data: quotes }, { data: clients }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, client:clients(id, company_name, contact_name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, company_name, contact_name, contact_email")
      .eq("is_active", true)
      .order("company_name"),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <QuotesClient initialQuotes={quotes ?? []} clients={clients ?? []} />
    </div>
  );
}
