import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/templates/template-editor";

export const dynamic = "force-dynamic";

export default async function TemplateEditorPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: userData } = await db.from("users").select("tenant_id, role").eq("id", user?.id).single();

  const { data: template } = await db
    .from("templates")
    .select("id, name, document_content, created_by")
    .eq("id", params.id)
    .single();

  if (!template) notFound();

  // Editable by the creator or the tenant owner; everyone else views read-only.
  const canEdit = userData?.role === "owner" || (template.created_by != null && template.created_by === user?.id);

  let tenant = null;
  if (userData?.tenant_id) {
    const { data } = await db
      .from("tenants").select("name, contact_name, email, address, phone").eq("id", userData.tenant_id).single();
    tenant = data;
  }

  return <TemplateEditor template={template} tenant={tenant} canEdit={canEdit} />;
}
