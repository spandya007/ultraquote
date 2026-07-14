import { getConnectionSecrets } from "../store";
import { findOrCreateCustomer, findOrCreateServiceItem, createInvoice, type QboInvoiceLine } from "./client";
import { lineRev, lineSetup } from "@/lib/pdf/serialize";

// Best-effort: create a QBO invoice when a quote is signed. Idempotent (skips if
// quotes.qbo_invoice_id is already set, QBO isn't connected, or the tenant opted
// out via settings.create_invoice_on_signed=false). NEVER throws to the caller —
// logs and returns, so a QBO hiccup can't break the DocuSeal webhook.
// docs/integrations-phase-a-plan.md (A3).
//
// v1 mapping: one fallback service item ("UltraQuote Services") with the line's
// own description/qty/discounted-unit-price. Catalog item mapping + tax mirroring
// (QBO AST) are deferred. Uses the RECOMMENDED scenario (→ selected → first).
export async function createInvoiceOnSigned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  quoteId: string
): Promise<void> {
  try {
    const { data: quote } = await db
      .from("quotes")
      .select("id, tenant_id, client_id, quote_number, selected_scenario_id, qbo_invoice_id")
      .eq("id", quoteId)
      .maybeSingle();
    if (!quote || quote.qbo_invoice_id) return; // already invoiced or missing

    const conn = await getConnectionSecrets(quote.tenant_id, "qbo");
    if (!conn || conn.status !== "connected") return;
    if (conn.settings?.create_invoice_on_signed === false) return;

    const { data: scenarios } = await db
      .from("quote_scenarios")
      .select("id, is_recommended, sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order");
    if (!scenarios || scenarios.length === 0) return;
    const scenario =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scenarios.find((s: any) => s.is_recommended) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scenarios.find((s: any) => s.id === quote.selected_scenario_id) ??
      scenarios[0];

    const { data: items } = await db
      .from("quote_line_items")
      .select("description, quantity, unit_price, setup_price, discount_percent, discount_amount, billing_period")
      .eq("scenario_id", scenario.id)
      .order("sort_order");
    if (!items || items.length === 0) return;

    const { data: client } = await db
      .from("clients")
      .select("company_name, contact_email")
      .eq("id", quote.client_id)
      .maybeSingle();
    if (!client) return;

    // Build lines from discounted revenue (matches the quote/PDF math exactly).
    const lines: QboInvoiceLine[] = [];
    for (const it of items) {
      const revenue = lineRev(it);
      if (revenue > 0) {
        lines.push({
          description: it.description || "Item",
          quantity: it.quantity,
          unitPrice: it.quantity > 0 ? revenue / it.quantity : revenue,
          amount: revenue,
        });
      }
      const setup = lineSetup(it);
      if (setup > 0) {
        lines.push({
          description: `${it.description || "Item"} — setup (one-time)`,
          quantity: 1,
          unitPrice: setup,
          amount: setup,
        });
      }
    }
    if (lines.length === 0) return;

    const customerId = await findOrCreateCustomer(quote.tenant_id, client);
    const itemId = await findOrCreateServiceItem(quote.tenant_id, "UltraQuote Services");
    const invoiceId = await createInvoice(quote.tenant_id, {
      customerId,
      itemId,
      lines,
      docNumber: quote.quote_number,
    });

    await db.from("quotes").update({ qbo_invoice_id: invoiceId }).eq("id", quoteId);
    console.log(`[qbo] created invoice ${invoiceId} for quote ${quoteId}`);
  } catch (e) {
    console.error(`[qbo] invoice-on-signed failed for quote ${quoteId}:`, e);
  }
}
