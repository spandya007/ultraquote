import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { QuoteEditor } from "@/components/quotes/quote-editor";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUserContext } from "@/lib/auth/user-context";

// Always load a fresh quote + product catalog so newly-added line items pick up
// current catalog prices/setup fees (avoids a stale cached product list).
export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // User + tenant come from the shared per-request cache (already loaded by the
  // dashboard layout), so this adds no extra round-trips. The tenant row carries
  // the company fields we used to re-fetch here.
  const user = await getCurrentUser();
  const ctx = user ? await getUserContext(user.id) : null;

  // NOTE: the product catalog is NOT fetched here — the quote editor loads it
  // lazily client-side when the "Add from catalog" overlay opens, so opening a
  // quote isn't blocked on fetching every product + pricing tier.
  const [quoteResult, settingsRes] =
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
      // Company-wide tax rate (Settings → Company Settings) — applied to all quotes.
      ctx?.tenant_id
        ? db.from("tenant_settings").select("default_tax_rate, default_font").eq("tenant_id", ctx.tenant_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const t = ctx?.tenant;
  const tenant = t
    ? { id: t.id, name: t.name, contact_name: t.contact_name, email: t.email, address: t.address, phone: t.phone }
    : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyTaxRate: number | null = (settingsRes?.data as any)?.default_tax_rate ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyFont: string | null = (settingsRes?.data as any)?.default_font ?? null;

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
  const isOwner = ctx?.role === "owner";
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
      tenant={tenant}
      companyTaxRate={companyTaxRate}
      companyFont={companyFont}
      canEdit={canEdit}
      isOwner={isOwner}
      creatorName={creatorName}
    />
  );
}
