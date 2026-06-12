import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsvText } from "@/lib/import/csv-products";

// Use a loosely typed Supabase client alias for bulk upsert operations
// to avoid TypeScript fighting over strict union literal types in our Database type.
type AnyRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get the tenant_id for this user
  const { data: userData } = await db
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single() as { data: { tenant_id: string; role: string } | null };

  if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (userData.role !== "owner") {
    return NextResponse.json({ error: "Only the tenant owner can import products" }, { status: 403 });
  }
  const tenant_id = userData.tenant_id;

  // Parse CSV from body
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const { products, error: parseError } = parseCsvText(text);

  if (parseError) {
    return NextResponse.json({ error: parseError }, { status: 400 });
  }

  // Fetch existing product categories for this tenant
  const { data: categories } = await db
    .from("product_categories")
    .select("id, name")
    .eq("tenant_id", tenant_id) as { data: { id: string; name: string }[] | null };

  const categoryMap = new Map<string, string>(
    (categories ?? []).map((c) => [c.name.toLowerCase(), c.id] as [string, string])
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of products) {
    try {
      // Resolve category — exact match, then partial
      let category_id: string | null = null;
      if (p.product_category) {
        const key = p.product_category.toLowerCase();
        if (categoryMap.has(key)) {
          category_id = categoryMap.get(key)!;
        } else {
          for (const [k, v] of categoryMap) {
            if (k.includes(key) || key.includes(k)) { category_id = v; break; }
          }
        }
      }
      // Fallback by item_type
      if (!category_id && p.item_type) {
        const fallback: Record<string, string> = {
          Service:  "managed services",
          Hardware: "hardware",
          Software: "software",
          Other:    "professional services",
        };
        category_id = categoryMap.get(fallback[p.item_type] ?? "") ?? null;
      }

      // Re-import idempotency: match the legacy Zomentum Id when the file has
      // one, otherwise the product name (case-insensitive). A renamed product
      // therefore imports as a new product — name is the matching key.
      let existingQuery = db
        .from("products")
        .select("id")
        .eq("tenant_id", tenant_id)
        .limit(1);
      existingQuery = p.zomentum_id
        ? existingQuery.eq("zomentum_id", p.zomentum_id)
        : existingQuery.ilike("name", p.name.replace(/([%_\\])/g, "\\$1"));
      const { data: existing } = await existingQuery.maybeSingle() as { data: { id: string } | null };

      let product_id: string;

      const productPayload: AnyRecord = {
        name:                 p.name,
        item_type:            p.item_type,
        description:          p.description,
        billing_period:       p.billing_period,
        unit_cost:            p.unit_cost,
        unit_price:           p.unit_price,
        setup_price:          p.setup_price,
        category_id,
        manufacturer:         p.manufacturer,
        manufacturer_part_no: p.manufacturer_part_no,
        supplier_name:        p.supplier_name,
        supplier_sku:         p.supplier_sku,
        autotask_id:          p.autotask_id,
        quickbooks_online_id: p.quickbooks_online_id,
      };

      if (existing) {
        await db.from("products").update(productPayload).eq("id", existing.id);
        product_id = existing.id;
      } else {
        const { data: inserted, error: insertErr } = await db
          .from("products")
          .insert({ tenant_id, zomentum_id: p.zomentum_id, source: "csv", ...productPayload })
          .select("id")
          .single() as { data: { id: string } | null; error: Error | null };

        if (insertErr) throw new Error(insertErr.message);
        product_id = inserted!.id;
      }

      // Upsert pricing tiers
      for (const tier of p.pricing_tiers) {
        const { data: existingTier } = await db
          .from("product_pricing_tiers")
          .select("id")
          .eq("product_id", product_id)
          .eq("tier_name", tier.tier_name)
          .maybeSingle() as { data: { id: string } | null };

        const tierPayload: AnyRecord = {
          product_id,
          tier_name:   tier.tier_name,
          description: tier.description,
          unit_cost:   tier.unit_cost,
          unit_price:  tier.unit_price,
          is_default:  tier.is_default,
          sort_order:  tier.sort_order,
        };

        if (existingTier) {
          const { product_id: _pid, tier_name: _tn, ...updatePayload } = tierPayload;
          await db.from("product_pricing_tiers").update(updatePayload).eq("id", existingTier.id);
        } else {
          await db.from("product_pricing_tiers").insert(tierPayload);
        }
      }

      imported++;
    } catch (err) {
      errors.push(`${p.name}: ${err instanceof Error ? err.message : "unknown error"}`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, skipped, errors, total: products.length });
}
