import { createClient } from "@/lib/supabase/server";
import { ClientsClient } from "@/components/clients/clients-client";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: clients }, { data: me }] = await Promise.all([
    supabase.from("clients").select("*").order("company_name"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("users").select("role").eq("id", user?.id ?? "").maybeSingle() as Promise<{ data: { role: string } | null }>,
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ClientsClient initialClients={clients ?? []} isOwner={me?.role === "owner"} />
    </div>
  );
}
