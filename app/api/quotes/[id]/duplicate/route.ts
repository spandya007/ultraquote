import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/access/guard";
import { countDraftCallsForQuote } from "@/lib/ai/usage";

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

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

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
    return NextResponse.json({ error: srcErr?.message ?? "Proposal not found" }, { status: 404 });
  }

  // 2. Generate a fresh quote number (atomic, security-definer RPC).
  const { data: quote_number, error: numErr } = await db.rpc("next_quote_number", {
    p_tenant_id: tenant_id,
  }) as { data: string | null; error: { message: string } | null };
  if (numErr || !quote_number) {
    return NextResponse.json({ error: numErr?.message ?? "Failed to allocate proposal number" }, { status: 500 });
  }

  // 3. Insert the new quote (always a fresh draft). Any tenant member may
  // duplicate any quote they can read — the copy belongs to the duplicator.
  const { data: newQuote, error: insErr } = await db
    .from("quotes")
    .insert({
      tenant_id,
      created_by:       user.id,
      client_id:        src.client_id,
      title:            src.title ? `${src.title} (Copy)` : "Untitled Proposal (Copy)",
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

  // 5. Carry the source quote's used AI budget forward, so a copy does NOT reset the
  // per-quote draft cap (would otherwise be a trivial bypass). Best-effort: never
  // fail the duplicate over this (e.g. before migration 026).
  try {
    const srcLogged = await countDraftCallsForQuote(params.id);
    const { data: srcCarry } = await db
      .from("quotes").select("ai_draft_calls_carried").eq("id", params.id).maybeSingle() as {
        data: { ai_draft_calls_carried?: number } | null;
      };
    const carried = srcLogged + (srcCarry?.ai_draft_calls_carried ?? 0);
    if (carried > 0) {
      await db.from("quotes").update({ ai_draft_calls_carried: carried }).eq("id", newQuote.id);
    }
  } catch { /* ignore — carry-forward is best-effort */ }

  return NextResponse.json({ id: newQuote.id, quote_number: newQuote.quote_number });
}
