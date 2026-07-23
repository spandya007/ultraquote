import { withApiKey } from "@/lib/api/handler";
import { apiJson, apiError } from "@/lib/api/respond";
import { serializeProposalDetail } from "@/lib/api/serialize";

export const runtime = "nodejs";

// GET /api/v1/proposals/:id — full detail (scenarios + line items + totals + client).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withApiKey(req, { scope: "read" }, async ({ db }) => {
    // The quote is tenant-pinned by select(); its children are then safe to read
    // by parent id (they have no tenant_id column of their own).
    const { data: quote } = await db.select("quotes", "*").eq("id", params.id).maybeSingle();
    if (!quote) return apiError(404, "not_found", "Proposal not found.");

    const { data: scenarios } = await db
      .child("quote_scenarios")
      .select("id, name, is_recommended, sort_order")
      .eq("quote_id", quote.id)
      .order("sort_order");
    const scenarioList = scenarios ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsByScenario = new Map<string, any[]>();
    if (scenarioList.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ids = scenarioList.map((s: any) => s.id);
      const { data: items } = await db
        .child("quote_line_items")
        .select("scenario_id, description, details, billing_period, quantity, unit_price, setup_price, discount_percent, discount_amount, is_taxable")
        .in("scenario_id", ids)
        .order("sort_order");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const it of items ?? []) {
        const arr = itemsByScenario.get(it.scenario_id) ?? [];
        arr.push(it);
        itemsByScenario.set(it.scenario_id, arr);
      }
    }

    let client = null;
    if (quote.client_id) {
      const { data: c } = await db.select("clients", "*").eq("id", quote.client_id).maybeSingle();
      client = c ?? null;
    }

    return apiJson(serializeProposalDetail(quote, scenarioList, itemsByScenario, client));
  });
}
