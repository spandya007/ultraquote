import { withApiKey } from "@/lib/api/handler";
import { apiJson, apiError } from "@/lib/api/respond";
import { serializeClient } from "@/lib/api/serialize";

export const runtime = "nodejs";

const COLS = "id, company_name, contact_name, contact_email, contact_phone, secondary_contact_name, secondary_contact_email, secondary_contact_phone, address, address_street, address_suite, address_city, address_state, address_postal, address_country, is_active, created_at";

// GET /api/v1/clients — list active clients (newest first), paginated.
export async function GET(req: Request) {
  return withApiKey(req, { scope: "read" }, async ({ db }) => {
    const p = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(parseInt(p.get("limit") || "25", 10) || 25, 1), 100);
    const offset = Math.max(parseInt(p.get("offset") || "0", 10) || 0, 0);
    const { data, error } = await db
      .select("clients", COLS)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return apiError(500, "query_failed", error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiJson({ data: (data ?? []).map((r: any) => serializeClient(r)), limit, offset });
  });
}

// Only these fields may be set via the API (mirrors the client drawer).
const ALLOWED = new Set([
  "contact_name", "contact_email", "contact_phone",
  "secondary_contact_name", "secondary_contact_email", "secondary_contact_phone",
  "address_street", "address_suite", "address_city", "address_state", "address_postal", "address_country",
  "notes",
]);

// POST /api/v1/clients — create a client. Requires the 'write' scope.
export async function POST(req: Request) {
  return withApiKey(req, { scope: "write" }, async ({ db }) => {
    const body = await req.json().catch(() => ({}));
    const companyName = typeof body.company_name === "string" ? body.company_name.trim() : "";
    if (!companyName) return apiError(400, "invalid_request", "company_name is required.");
    if (body.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.contact_email))) {
      return apiError(400, "invalid_request", "contact_email is not a valid email address.");
    }

    const row: Record<string, unknown> = { company_name: companyName };
    for (const [k, v] of Object.entries(body)) {
      if (ALLOWED.has(k) && v != null) row[k] = typeof v === "string" ? v.trim() : v;
    }

    const { data, error } = await db.insertOne("clients", row);
    if (error) return apiError(500, "insert_failed", error.message);
    return apiJson(serializeClient(data), 201);
  });
}
