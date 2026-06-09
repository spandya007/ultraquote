"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

const ProposalEditor = dynamic(
  () => import("@/components/quotes/proposal-editor").then(m => m.ProposalEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading editor…</div> }
);

interface TenantData {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: { id: string; name: string; document_content: any[] | null };
  tenant: TenantData | null;
}

export function TemplateEditor({ template, tenant }: Props) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;
  const toast = useToast();
  const [name, setName] = useState(template.name);

  async function saveName() {
    const clean = name.trim() || "Untitled template";
    const { error } = await db.from("templates").update({ name: clean }).eq("id", template.id);
    if (error) toast.error("Failed to save template name");
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="flex items-center gap-4 px-6 py-3 border-b bg-background shrink-0">
        <button onClick={() => router.push("/templates")} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground">Template</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            placeholder="Template name"
            className="block text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 p-0 w-full"
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <ProposalEditor
          quoteId={template.id}
          isTemplate
          initialContent={template.document_content}
          clientData={null}
          tenantData={tenant}
          scenarios={[]}
          taxRate={0}
          showMargins={false}
        />
      </div>
    </div>
  );
}
