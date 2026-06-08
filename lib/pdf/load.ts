import { buildImageUrlMap } from "./resolve-images";
import type { SerializeInput, DocBlock } from "./types";

/**
 * Loads everything the serializer needs for a quote: metadata, document blocks,
 * scenarios (with line items), client, and tenant — plus a resolved image URL
 * map. Returns null if the quote can't be found. Relies on RLS for tenant
 * isolation (callers pass an authenticated Supabase client).
 */
export async function loadSerializeInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  quoteId: string
): Promise<SerializeInput | null> {
  const db = supabase;

  const { data: quote } = await db
    .from("quotes")
    .select(`
      id, tenant_id, quote_number, title, valid_until, tax_rate, payment_terms, document_content,
      client:clients(company_name, contact_name, contact_email, contact_phone, address),
      scenarios:quote_scenarios!quote_id(
        id, name, is_recommended, sort_order,
        line_items:quote_line_items(description, billing_period, quantity, unit_price, is_taxable)
      )
    `)
    .eq("id", quoteId)
    .single();

  if (!quote) return null;

  const { data: tenant } = await db
    .from("tenants")
    .select("name, contact_name, email, phone, address, logo_url")
    .eq("id", quote.tenant_id)
    .single();

  const blocks: DocBlock[] = Array.isArray(quote.document_content) ? quote.document_content : [];
  const imageUrlMap = await buildImageUrlMap(blocks, supabase);

  // Resolve the tenant logo (also an sb-storage:// URL) into the same map so the
  // serializer can render it on the first page.
  if (tenant?.logo_url) {
    const logoMap = await buildImageUrlMap(
      [{ type: "image", props: { url: tenant.logo_url } }],
      supabase
    );
    Object.assign(imageUrlMap, logoMap);
  }

  return {
    quote: {
      quote_number:  quote.quote_number,
      title:         quote.title,
      valid_until:   quote.valid_until,
      tax_rate:      quote.tax_rate,
      payment_terms: quote.payment_terms,
    },
    blocks,
    scenarios: quote.scenarios ?? [],
    client: quote.client ?? {
      company_name: "", contact_name: null, contact_email: null, contact_phone: null, address: null,
    },
    tenant: tenant ?? {
      name: "", contact_name: null, email: null, phone: null, address: null, logo_url: null,
    },
    imageUrlMap,
  };
}
