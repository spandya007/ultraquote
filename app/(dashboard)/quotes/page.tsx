import { createClient } from "@/lib/supabase/server";
import { QuotesClient } from "@/components/quotes/quotes-client";

// Always render fresh from the DB (no static optimization).
export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: quotes }, { data: clients }, { data: settings }, { data: teamUsers }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, client:clients(id, company_name, contact_name), creator:users!created_by(full_name, email), signers:quote_signers(signer_email, role, status, signing_order, decline_reason)")
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, company_name, contact_name, contact_email")
      .eq("is_active", true)
      .order("company_name"),
    // Default Valid Days also controls how long inactive drafts stay visible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("tenant_settings").select("default_valid_days").maybeSingle(),
    // Tenant members, for the created-by filter (RLS scopes to own tenant).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("users").select("id, full_name, email, role").order("created_at") as Promise<{
      data: { id: string; full_name: string | null; email: string; role: string }[] | null;
    }>,
  ]);

  // Active templates for the New Quote "Start from" selector.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: templates } = await (supabase as any)
    .from("templates")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: false }) as { data: { id: string; name: string }[] | null };

  const me = (teamUsers ?? []).find((u) => u.id === user?.id);
  const others = (teamUsers ?? [])
    .filter((u) => u.id !== user?.id)
    .map((u) => ({ id: u.id, name: u.full_name || u.email }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <QuotesClient
        initialQuotes={quotes ?? []}
        clients={clients ?? []}
        validDays={settings?.default_valid_days ?? 30}
        currentUserId={user?.id ?? ""}
        isOwner={me?.role === "owner"}
        teamUsers={others}
        templates={templates ?? []}
      />
    </div>
  );
}
