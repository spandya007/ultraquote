import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiGenerate, geminiErrorMessage } from "@/lib/ai/gemini";

// Extracts pricing line items from imported document tables (via Gemini JSON
// mode) and classifies each against the tenant's product catalog.

export const runtime = "nodejs";

const MODEL = "gemini-2.5-flash";

interface IncomingTable { heading?: string; rows: string[][] }
interface ExtractBody { tables: IncomingTable[] }

interface AiLineItem {
  description: string;
  billing_period: "Monthly" | "One Time";
  quantity: number;
  unit_price: number;
  is_taxable?: boolean;
}
interface AiScenario { name: string; line_items: AiLineItem[] }

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI is not configured. Set GEMINI_API_KEY." }, { status: 501 });

  const body = (await request.json()) as ExtractBody;
  if (!body.tables?.length) {
    return NextResponse.json({ error: "No tables found in the document to extract from." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: userData } = await db.from("users").select("tenant_id, role").eq("id", user.id).single();
  const tenantId = userData?.tenant_id;
  // Owner-only: the downstream apply step can create catalog products.
  if (userData?.role !== "owner") {
    return NextResponse.json({ error: "Only the tenant owner can extract pricing" }, { status: 403 });
  }

  // ── Ask Gemini to extract pricing line items grouped into scenarios ─────────
  const prompt = [
    "You are a data-extraction assistant for a Managed Service Provider's quoting tool.",
    "Below are tables extracted from a proposal document (each with an optional preceding heading).",
    "Identify ONLY the tables that contain pricing/line-item information (services or products with prices). IGNORE non-pricing tables (e.g. contact info, schedules, generic field/value tables).",
    "For each pricing table, produce a scenario. Use the table's heading as the scenario name (or a concise sensible name).",
    "For each row, output a line item with: description, billing_period ('Monthly' or 'One Time'), quantity (default 1 if absent), unit_price (a number; if only a line total and quantity are given, compute unit_price = total / quantity), and is_taxable (boolean, default false).",
    "Infer billing_period from column headers/wording (monthly/MRR/recurring → 'Monthly'; setup/one-time/install/hardware → 'One Time'). Strip currency symbols and commas from numbers.",
    'Return ONLY JSON of the form: {"scenarios":[{"name":"...","line_items":[{"description":"...","billing_period":"Monthly","quantity":1,"unit_price":0,"is_taxable":false}]}]}. If no pricing tables are found, return {"scenarios":[]}.',
    "Tables:",
    JSON.stringify(body.tables).slice(0, 12000),
  ].join("\n\n");

  let resp: Response;
  try {
    resp = await geminiGenerate(MODEL, apiKey, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `AI service unreachable: ${(e as Error).message}` }, { status: 502 });
  }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return NextResponse.json({ error: geminiErrorMessage(resp.status), detail }, { status: 502 });
  }

  const data = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
  let parsed: { scenarios: AiScenario[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Could not parse AI response. Try again." }, { status: 502 });
  }
  const scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
  if (scenarios.length === 0) {
    return NextResponse.json({ scenarios: [] });
  }

  // ── Classify each line item against the catalog (conservative name match) ───
  const { data: products } = await db
    .from("products")
    .select("id, name, description, unit_cost, unit_price, billing_period, is_taxable, pricing_tiers:product_pricing_tiers(id, unit_cost, unit_price, is_default)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byName = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (products ?? []) as any[]) byName.set(normalizeName(p.name), p);

  const out = scenarios.map((s) => ({
    name: s.name || "Imported pricing",
    lineItems: (s.line_items ?? []).map((li) => {
      const match = byName.get(normalizeName(li.description));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tier = match ? ((match.pricing_tiers ?? []).find((t: any) => t.is_default) ?? match.pricing_tiers?.[0]) : null;
      return {
        description:    li.description,
        billing_period: li.billing_period === "One Time" ? "One Time" : "Monthly",
        quantity:       Number(li.quantity) > 0 ? Math.round(Number(li.quantity)) : 1,
        unit_price:     Number(li.unit_price) || 0,
        is_taxable:     !!li.is_taxable,
        match: match ? {
          productId:  match.id,
          name:       match.name,
          tierId:     tier?.id ?? null,
          unitPrice:  tier?.unit_price ?? match.unit_price,
          unitCost:   tier?.unit_cost ?? match.unit_cost,
        } : null,
      };
    }),
  }));

  return NextResponse.json({ scenarios: out });
}
