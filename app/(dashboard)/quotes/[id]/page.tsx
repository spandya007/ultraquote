import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { QuoteEditor } from "@/components/quotes/quote-editor";

export default async function QuotePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Resolve current user's tenant_id
  const { data: { user } } = await supabase.auth.getUser();
  const { data: userData } = await db
    .from("users")
    .select("tenant_id, role")
    .eq("id", user?.id)
    .single() as { data: { tenant_id: string; role: "owner" | "member" } | null };

  const [quoteResult, { data: products }, { data: categories }] =
    await Promise.all([
      db
        .from("quotes")
        .select(`
          *,
          client:clients(*),
          scenarios:quote_scenarios!quote_id(
            *,
            line_items:quote_line_items(*)
          )
        `)
        .eq("id", params.id)
        .single(),
      db
        .from("products")
        .select("*, pricing_tiers:product_pricing_tiers(*)")
        .eq("is_active", true)
        .order("name"),
      db
        .from("product_categories")
        .select("*")
        .order("sort_order"),
    ]);

  // Fetch tenant separately so we can log errors (e.g. missing column)
  let tenant = null;
  let companyTaxRate: number | null = null;
  if (userData?.tenant_id) {
    const { data, error } = await db
      .from("tenants")
      .select("id, name, contact_name, email, address, phone")
      .eq("id", userData.tenant_id)
      .single();
    if (error) {
      console.error("[QuotePage] tenant fetch error:", error.message, error.details);
    } else {
      tenant = data;
    }
    // Company-wide tax rate (Settings → Company Settings) — applied to all quotes.
    const { data: settings } = await db
      .from("tenant_settings")
      .select("default_tax_rate")
      .eq("tenant_id", userData.tenant_id)
      .maybeSingle();
    companyTaxRate = settings?.default_tax_rate ?? null;
  }

  if (!quoteResult.data) {
    console.error("[QuotePage] query error:", quoteResult.error?.message);
    notFound();
  }

  const quote = quoteResult.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = quote as any;

  const sortedScenarios = (raw.scenarios ?? [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((s: { line_items: { sort_order: number }[] }) => ({
      ...s,
      line_items: [...s.line_items].sort((a, b) => a.sort_order - b.sort_order),
    }));

  // Ownership: only the creator or the tenant owner may edit (RLS enforces the
  // same server-side; this drives the read-only UI). Legacy quotes without
  // created_by are editable by the owner only.
  const isOwner = userData?.role === "owner";
  const canEdit = isOwner || (raw.created_by != null && raw.created_by === user?.id);
  let creatorName: string | null = null;
  if (raw.created_by) {
    const { data: creator } = await db
      .from("users")
      .select("full_name, email")
      .eq("id", raw.created_by)
      .maybeSingle();
    creatorName = creator?.full_name || creator?.email || null;
  }

  return (
    <QuoteEditor
      quote={{ ...raw, scenarios: sortedScenarios }}
      products={products ?? []}
      categories={categories ?? []}
      tenant={tenant}
      companyTaxRate={companyTaxRate}
      canEdit={canEdit}
      isOwner={isOwner}
      creatorName={creatorName}
    />
  );
}
