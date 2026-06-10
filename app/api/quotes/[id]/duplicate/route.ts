import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Clones a quote (metadata + document) plus all its scenarios and line items
// into a brand-new draft quote with a fresh quote number.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userData } = await db
    .from("users").select("tenant_id").eq("id", user.id).single() as { data: { tenant_id: string } | null };
  if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const tenant_id = userData.tenant_id;

  // 1. Load the source quote with scenarios + line items (RLS scopes to tenant).
  const { data: src, error: srcErr } = await db
    .from("quotes")
    .select(`
      client_id, title, tax_rate, payment_terms, notes, show_margins, document_content,
      scenarios:quote_scenarios!quote_id(
        name, description, is_recommended, sort_order,
        monthly_recurring_total, onetime_total, tax_amount, total,
        line_items:quote_line_items(
          product_id, pricing_tier_id, description, billing_period,
          quantity, unit_cost, unit_price, setup_price, is_taxable, discount_percent, discount_amount, sort_order
        )
      )
    `)
    .eq("id", params.id)
    .single();

  if (srcErr || !src) {
    return NextResponse.json({ error: srcErr?.message ?? "Quote not found" }, { status: 404 });
  }

  // 2. Generate a fresh quote number (same logic as quote creation).
  let { data: settings } = await db
    .from("tenant_settings")
    .select("quote_number_prefix, quote_number_sequence")
    .eq("tenant_id", tenant_id)
    .single() as { data: { quote_number_prefix: string; quote_number_sequence: number } | null };

  if (!settings) {
    await db.from("tenant_settings").insert({ tenant_id });
    settings = { quote_number_prefix: "QUOTE", quote_number_sequence: 1 };
  }

  const year = new Date().getFullYear();
  const seq = settings.quote_number_sequence;
  const quote_number = `${settings.quote_number_prefix}-${year}-${String(seq).padStart(3, "0")}`;
  await db.from("tenant_settings").update({ quote_number_sequence: seq + 1 }).eq("tenant_id", tenant_id);

  // 3. Insert the new quote (always a fresh draft).
  const { data: newQuote, error: insErr } = await db
    .from("quotes")
    .insert({
      tenant_id,
      client_id:        src.client_id,
      title:            src.title ? `${src.title} (Copy)` : "Untitled Quote (Copy)",
      status:           "draft",
      quote_number,
      tax_rate:         src.tax_rate,
      payment_terms:    src.payment_terms,
      notes:            src.notes,
      show_margins:     src.show_margins,
      document_content: src.document_content,
    })
    .select("id, quote_number")
    .single() as { data: { id: string; quote_number: string } | null; error: { message: string } | null };

  if (insErr || !newQuote) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to create copy" }, { status: 500 });
  }

  // 4. Clone each scenario, then its line items under the new scenario id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scenarios = (src.scenarios ?? []) as any[];
  for (const s of scenarios) {
    const { data: newScenario, error: scErr } = await db
      .from("quote_scenarios")
      .insert({
        quote_id:                newQuote.id,
        name:                    s.name,
        description:             s.description,
        is_recommended:          s.is_recommended,
        sort_order:              s.sort_order,
        monthly_recurring_total: s.monthly_recurring_total,
        onetime_total:           s.onetime_total,
        tax_amount:              s.tax_amount,
        total:                   s.total,
      })
      .select("id")
      .single() as { data: { id: string } | null; error: { message: string } | null };

    if (scErr || !newScenario) {
      return NextResponse.json({ error: scErr?.message ?? "Failed to copy scenario" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (s.line_items ?? []) as any[];
    if (items.length > 0) {
      const payload = items.map((i) => ({
        scenario_id:     newScenario.id,
        product_id:      i.product_id,
        pricing_tier_id: i.pricing_tier_id,
        description:     i.description,
        billing_period:  i.billing_period,
        quantity:        i.quantity,
        unit_cost:       i.unit_cost,
        unit_price:      i.unit_price,
        setup_price:     i.setup_price,
        is_taxable:      i.is_taxable,
        discount_percent: i.discount_percent ?? 0,
        discount_amount: i.discount_amount ?? 0,
        sort_order:      i.sort_order,
      }));
      const { error: liErr } = await db.from("quote_line_items").insert(payload);
      if (liErr) {
        return NextResponse.json({ error: liErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ id: newQuote.id, quote_number: newQuote.quote_number });
}
