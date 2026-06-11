import { createClient } from "@/lib/supabase/server";
import { TemplatesClient } from "@/components/templates/templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: templates }, { data: me }, { data: clients }] = await Promise.all([
    db
      .from("templates")
      .select("id, name, description, created_at, created_by, creator:users!created_by(full_name, email)")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    db.from("users").select("role").eq("id", user?.id ?? "").maybeSingle(),
    // For the "New quote from this template" modal.
    db.from("clients").select("id, company_name, contact_name, contact_email").eq("is_active", true).order("company_name"),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TemplatesClient
        initialTemplates={templates ?? []}
        currentUserId={user?.id ?? ""}
        isOwner={me?.role === "owner"}
        clients={clients ?? []}
      />
    </div>
  );
}
