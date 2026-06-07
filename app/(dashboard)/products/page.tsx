import { createClient } from "@/lib/supabase/server";
import { ProductsClient } from "@/components/products/products-client";

export default async function ProductsPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase
      .from("products")
      .select("*, category:product_categories(id, name), pricing_tiers:product_pricing_tiers(*)")
      .order("name"),
    supabase
      .from("product_categories")
      .select("*")
      .order("sort_order"),
  ]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ProductsClient
        initialProducts={products ?? []}
        categories={categories ?? []}
      />
    </div>
  );
}
