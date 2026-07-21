import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/access/guard";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

  // Get tenant
  const { data: userData } = await db
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single() as { data: { tenant_id: string } | null };

  if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const tenant_id = userData.tenant_id;

  const body = await request.json();
  const { client_id, title, valid_until, template_id } = body;

  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  // "Start from template": copy the template's document into the new quote.
  // Templates are tenant-readable under RLS, so this is naturally scoped.
  let documentContent: unknown = null;
  if (template_id) {
    const { data: tpl, error: tplErr } = await db
      .from("templates")
      .select("document_content")
      .eq("id", template_id)
      .eq("is_active", true)
      .maybeSingle();
    if (tplErr || !tpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    documentContent = tpl.document_content ?? null;
  }

  // Reject a duplicate (case-insensitive) title within this tenant.
  if (title && title.trim()) {
    const { data: dup } = await db
      .from("quotes")
      .select("id")
      .eq("tenant_id", tenant_id)
      .ilike("title", title.trim())
      .limit(1)
      .maybeSingle() as { data: { id: string } | null };
    if (dup) {
      return NextResponse.json(
        { error: "A proposal with this title already exists. Please choose a different title." },
        { status: 409 }
      );
    }
  }

  // Defaults for the new quote (tax rate); reads are tenant-wide under RLS.
  const { data: settings } = await db
    .from("tenant_settings")
    .select("default_tax_rate")
    .eq("tenant_id", tenant_id)
    .maybeSingle() as { data: { default_tax_rate: number | null } | null };

  // Atomic number allocation via security-definer RPC: members can't update
  // tenant_settings directly (owner-only policy), and this also avoids the
  // old read-then-update race on the sequence.
  const { data: quote_number, error: numErr } = await db.rpc("next_quote_number", {
    p_tenant_id: tenant_id,
  }) as { data: string | null; error: { message: string } | null };
  if (numErr || !quote_number) {
    return NextResponse.json({ error: numErr?.message ?? "Failed to allocate proposal number" }, { status: 500 });
  }

  // Insert quote — pass explicit quote_number so trigger WHEN clause is skipped
  const { data: quote, error: quoteErr } = await db
    .from("quotes")
    .insert({
      tenant_id,
      created_by:       user.id,
      client_id,
      template_id:      template_id || null,
      document_content: documentContent,
      title:            title || null,
      status:           "draft",
      valid_until,
      quote_number,
      tax_rate:         settings?.default_tax_rate ?? null,
    })
    .select("id, quote_number")
    .single() as { data: { id: string; quote_number: string } | null; error: { message: string } | null };

  if (quoteErr || !quote) {
    return NextResponse.json({ error: quoteErr?.message ?? "Failed to create proposal" }, { status: 500 });
  }

  // Create default scenario
  const { error: scenarioErr } = await db.from("quote_scenarios").insert({
    quote_id:       quote.id,
    name:           "Scenario A",
    is_recommended: true,
    sort_order:     0,
  });

  if (scenarioErr) {
    return NextResponse.json({ error: scenarioErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: quote.id, quote_number: quote.quote_number });
}
