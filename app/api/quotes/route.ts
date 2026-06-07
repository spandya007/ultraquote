import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get tenant
  const { data: userData } = await db
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single() as { data: { tenant_id: string } | null };

  if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const tenant_id = userData.tenant_id;

  const body = await request.json();
  const { client_id, title, valid_until } = body;

  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  // Fetch (or create) tenant_settings
  let { data: settings } = await db
    .from("tenant_settings")
    .select("quote_number_prefix, quote_number_sequence, default_tax_rate, default_valid_days, default_payment_terms")
    .eq("tenant_id", tenant_id)
    .single() as {
      data: {
        quote_number_prefix:    string;
        quote_number_sequence:  number;
        default_tax_rate:       number | null;
        default_valid_days:     number;
        default_payment_terms:  string;
      } | null
    };

  if (!settings) {
    await db.from("tenant_settings").insert({ tenant_id });
    settings = {
      quote_number_prefix:   "QUOTE",
      quote_number_sequence: 1,
      default_tax_rate:      null,
      default_valid_days:    30,
      default_payment_terms: "Net 30",
    };
  }

  // Generate quote number here so we don't depend solely on the trigger
  const year  = new Date().getFullYear();
  const seq   = settings.quote_number_sequence;
  const quote_number = `${settings.quote_number_prefix}-${year}-${String(seq).padStart(3, "0")}`;

  // Increment sequence
  await db
    .from("tenant_settings")
    .update({ quote_number_sequence: seq + 1 })
    .eq("tenant_id", tenant_id);

  // Insert quote — pass explicit quote_number so trigger WHEN clause is skipped
  const { data: quote, error: quoteErr } = await db
    .from("quotes")
    .insert({
      tenant_id,
      client_id,
      title:        title || null,
      status:       "draft",
      valid_until,
      quote_number,
      tax_rate:     settings.default_tax_rate ?? null,
    })
    .select("id, quote_number")
    .single() as { data: { id: string; quote_number: string } | null; error: { message: string } | null };

  if (quoteErr || !quote) {
    return NextResponse.json({ error: quoteErr?.message ?? "Failed to create quote" }, { status: 500 });
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
