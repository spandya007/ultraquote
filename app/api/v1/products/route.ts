import { withApiKey } from "@/lib/api/handler";
import { apiJson, apiError } from "@/lib/api/respond";
import { serializeProduct } from "@/lib/api/serialize";

export const runtime = "nodejs";

const COLS = "id, name, description, item_type, billing_period, unit, unit_price, setup_price, is_taxable, is_active";

// GET /api/v1/products — the tenant's active catalog, paginated.
export async function GET(req: Request) {
  return withApiKey(req, { scope: "read" }, async ({ db }) => {
    const p = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(parseInt(p.get("limit") || "50", 10) || 50, 1), 100);
    const offset = Math.max(parseInt(p.get("offset") || "0", 10) || 0, 0);
    const { data, error } = await db
      .select("products", COLS)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) return apiError(500, "query_failed", error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiJson({ data: (data ?? []).map((r: any) => serializeProduct(r)), limit, offset });
  });
}
