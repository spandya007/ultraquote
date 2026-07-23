import { withApiKey } from "@/lib/api/handler";
import { apiJson, apiError } from "@/lib/api/respond";
import { serializeProposalSummary } from "@/lib/api/serialize";

export const runtime = "nodejs";

const COLS = "id, quote_number, title, status, client_id, valid_until, sent_at, signed_at, pdf_url, created_at, updated_at";

// GET /api/v1/proposals — list, newest first. Filters: status, client_id,
// updated_since (ISO). Pagination: limit (1–100, default 25), offset.
export async function GET(req: Request) {
  return withApiKey(req, { scope: "read" }, async ({ db }) => {
    const p = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(parseInt(p.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(p.get("offset") || "0", 10) || 0, 0);

    let q = db.select("quotes", COLS).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    const status = p.get("status");
    const clientId = p.get("client_id");
    const updatedSince = p.get("updated_since");
    if (status) q = q.eq("status", status);
    if (clientId) q = q.eq("client_id", clientId);
    if (updatedSince) q = q.gte("updated_at", updatedSince);

    const { data, error } = await q;
    if (error) return apiError(500, "query_failed", error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiJson({ data: (data ?? []).map((r: any) => serializeProposalSummary(r)), limit, offset });
  });
}
