import { createClient } from "@/lib/supabase/server";
import { ProductsClient } from "@/components/products/products-client";

export default async function ProductsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: products }, { data: categories }, { data: me }] = await Promise.all([
    supabase
      .from("products")
      .select("*, category:product_categories(id, name), pricing_tiers:product_pricing_tiers(*)")
      .order("name"),
    supabase
      .from("product_categories")
      .select("*")
      .order("sort_order"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("users").select("role").eq("id", user?.id ?? "").maybeSingle() as Promise<{ data: { role: string } | null }>,
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ProductsClient
        initialProducts={products ?? []}
        categories={categories ?? []}
        isOwner={me?.role === "owner"}
      />
    </div>
  );
}
