import { createClient } from "@/lib/supabase/server";
import { TemplatesClient } from "@/components/templates/templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: templates }, { data: me }] = await Promise.all([
    db
      .from("templates")
      .select("id, name, description, created_at, created_by, creator:users!created_by(full_name, email)")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    db.from("users").select("role").eq("id", user?.id ?? "").maybeSingle(),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TemplatesClient
        initialTemplates={templates ?? []}
        currentUserId={user?.id ?? ""}
        isOwner={me?.role === "owner"}
      />
    </div>
  );
}
