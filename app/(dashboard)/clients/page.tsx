import { createClient } from "@/lib/supabase/server";
import { ClientsClient } from "@/components/clients/clients-client";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("company_name");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ClientsClient initialClients={clients ?? []} />
    </div>
  );
}
