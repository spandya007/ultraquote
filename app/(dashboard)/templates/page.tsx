import { createClient } from "@/lib/supabase/server";
import { TemplatesClient } from "@/components/templates/templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: templates } = await db
    .from("templates")
    .select("id, name, description, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <TemplatesClient initialTemplates={templates ?? []} />
    </div>
  );
}
