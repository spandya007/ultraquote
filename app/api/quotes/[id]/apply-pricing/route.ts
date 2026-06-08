import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Creates scenarios + line items in a quote from reviewed pricing-extraction
// results. Per line item, `action` decides the catalog behavior:
//   - "link":     link to an existing catalog product (uses catalog price/cost)
//   - "create":   create a NEW catalog product (+ default tier + audit), then link
//   - "freetext": custom line item, no catalog product

export const runtime = "nodejs";

interface InLineItem {
  description: string;
  billing_period: "Monthly" | "One Time";
  quantity: number;
  unit_price: number;
  is_taxable: boolean;
  action: "link" | "create" | "freetext";
  productId?: string | null;
  tierId?: string | null;
  unitCost?: number | null;
}
interface InScenario { name: string; lineItems: InLineItem[] }

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function calcTotals(items: { billing_period: string; quantity: number; unit_price: number; is_taxable: boolean }[], taxRate: number) {
  const monthly = items.filter(i => i.billing_period === "Monthly").reduce((s, i) => s + i.quantity * (i.unit_price ?? 0), 0);
  const onetime = items.filter(i => i.billing_period === "One Time").reduce((s, i) => s + i.quantity * (i.unit_price ?? 0), 0);
  const taxable = items.filter(i => i.is_taxable).reduce((s, i) => s + i.quantity * (i.unit_price ?? 0), 0);
  const tax = taxable * taxRate;
  return { monthly, onetime, tax, total: monthly + onetime + tax };
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: userData } = await db.from("users").select("tenant_id").eq("id", user.id).single();
  const tenantId = userData?.tenant_id;
  if (!tenantId) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { scenarios } = (await request.json()) as { scenarios: InScenario[] };
  if (!scenarios?.length) return NextResponse.json({ error: "Nothing to apply" }, { status: 400 });

  const { data: quote } = await db.from("quotes").select("id, tax_rate").eq("id", params.id).single();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const taxRate = quote.tax_rate ?? 0;

  // Resolve (or create) the "Professional Services" category for new products.
  async function professionalServicesCategoryId(): Promise<string | null> {
    const { data: existing } = await db
      .from("product_categories")
      .select("id").eq("tenant_id", tenantId).ilike("name", "Professional Services").maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created } = await db
      .from("product_categories")
      .insert({ tenant_id: tenantId, name: "Professional Services", sort_order: 99 })
      .select("id").single();
    return created?.id ?? null;
  }
  let proServicesCatId: string | null | undefined;

  // Dedup map for "create": normalized product name → { productId, tierId }.
  // Seeded with the tenant's existing catalog and extended as we create new
  // products, so the same service repeated across scenarios maps to ONE product.
  const productMap = new Map<string, { productId: string; tierId: string | null }>();
  const { data: existingProducts } = await db
    .from("products")
    .select("id, name, pricing_tiers:product_pricing_tiers(id, is_default)")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (existingProducts ?? []) as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tier = (p.pricing_tiers ?? []).find((t: any) => t.is_default) ?? p.pricing_tiers?.[0];
    productMap.set(normalizeName(p.name), { productId: p.id, tierId: tier?.id ?? null });
  }

  // Replace the default scenario only if it's the lone empty one.
  const { data: existingScenarios } = await db
    .from("quote_scenarios")
    .select("id, sort_order, line_items:quote_line_items(id)")
    .eq("quote_id", params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (existingScenarios ?? []) as any[];
  if (existing.length === 1 && (existing[0].line_items ?? []).length === 0) {
    await db.from("quote_scenarios").delete().eq("id", existing[0].id);
    existing.length = 0;
  }
  let sortOrder = existing.length;
  const MAX = 5;
  const created: { id: string; name: string }[] = [];

  for (const sc of scenarios) {
    if (sortOrder >= MAX) break;

    const { data: scenarioRow } = await db.from("quote_scenarios").insert({
      quote_id: params.id,
      name: sc.name?.slice(0, 80) || `Scenario ${String.fromCharCode(65 + sortOrder)}`,
      is_recommended: sortOrder === 0,
      sort_order: sortOrder,
    }).select("id").single();
    if (!scenarioRow) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved: any[] = [];
    let li = 0;
    for (const item of sc.lineItems) {
      let productId: string | null = null;
      let tierId: string | null = null;
      let unitPrice = item.unit_price;
      let unitCost: number | null = item.unitCost ?? null;
      let description = item.description;
      let isTaxable = item.is_taxable;

      if (item.action === "link" && item.productId) {
        // Force catalog values (canonical wins).
        productId = item.productId;
        tierId = item.tierId ?? null;
        const { data: prod } = await db
          .from("products")
          .select("description, unit_cost, unit_price, is_taxable, billing_period, pricing_tiers:product_pricing_tiers(id, unit_cost, unit_price, is_default)")
          .eq("id", item.productId).single();
        if (prod) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tier = tierId ? (prod.pricing_tiers ?? []).find((t: any) => t.id === tierId)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : ((prod.pricing_tiers ?? []).find((t: any) => t.is_default) ?? prod.pricing_tiers?.[0]);
          unitPrice = tier?.unit_price ?? prod.unit_price ?? unitPrice;
          unitCost = tier?.unit_cost ?? prod.unit_cost ?? unitCost;
          isTaxable = !!prod.is_taxable;
          tierId = tier?.id ?? tierId;
        }
      } else if (item.action === "create") {
        const norm = normalizeName(item.description);
        const seen = productMap.get(norm);
        if (seen) {
          // Same service already exists (catalog) or was created earlier in this
          // run — reuse it. The line item keeps its own quoted price.
          productId = seen.productId;
          tierId = seen.tierId;
        } else {
          if (proServicesCatId === undefined) proServicesCatId = await professionalServicesCategoryId();
          const { data: newProd } = await db.from("products").insert({
            tenant_id:      tenantId,
            category_id:    proServicesCatId,
            name:           item.description.slice(0, 200),
            description:    null,
            item_type:      "Service",
            billing_period: item.billing_period,
            unit_price:     item.unit_price,
            unit_cost:      null,
            setup_price:    0,
            is_taxable:     item.is_taxable,
            is_active:      true,
            source:         "document_import",
            source_quote_id: params.id,
          }).select("id").single();
          if (newProd) {
            productId = newProd.id;
            const { data: newTier } = await db.from("product_pricing_tiers").insert({
              product_id: newProd.id, tier_name: "Standard", unit_price: item.unit_price, unit_cost: null, is_default: true, sort_order: 0,
            }).select("id").single();
            tierId = newTier?.id ?? null;
            await db.from("product_audit").insert({
              tenant_id: tenantId, product_id: newProd.id, event: "created",
              source: "document_import", source_quote_id: params.id, created_by: user.id,
              details: { name: item.description, unit_price: item.unit_price, billing_period: item.billing_period },
            });
            productMap.set(norm, { productId: newProd.id, tierId });
          }
        }
      }
      // action "freetext" → leave productId/tierId null, use doc values.

      const { data: lineRow } = await db.from("quote_line_items").insert({
        scenario_id:     scenarioRow.id,
        product_id:      productId,
        pricing_tier_id: tierId,
        description,
        billing_period:  item.billing_period,
        quantity:        item.quantity,
        unit_cost:       unitCost,
        unit_price:      unitPrice,
        setup_price:     0,
        is_taxable:      isTaxable,
        sort_order:      li++,
      }).select("billing_period, quantity, unit_price, is_taxable").single();
      if (lineRow) resolved.push(lineRow);
    }

    const totals = calcTotals(resolved, taxRate);
    await db.from("quote_scenarios").update({
      monthly_recurring_total: totals.monthly,
      onetime_total:           totals.onetime,
      tax_amount:              totals.tax,
      total:                   totals.total,
    }).eq("id", scenarioRow.id);

    created.push({ id: scenarioRow.id, name: sc.name });
    sortOrder++;
  }

  return NextResponse.json({ created });
}
