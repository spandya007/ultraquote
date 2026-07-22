import { lineRev, lineSetup } from "@/lib/pdf/serialize";
import { newEventId, WEBHOOK_API_VERSION, type WebhookEventType } from "./events";

// Builds the versioned webhook payload for a proposal event. Totals come from the
// recommended (→selected→first) scenario using the SAME lineRev/lineSetup math as
// the PDF and the QBO invoice, so every surface reports identical numbers.
// Reads via the passed service-role `db` (webhook tables are service-role only).
// docs/integrations-phase-c-api-webhooks-zapier.md §2.2.

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  api_version: string;
  created_at: string;
  tenant_id: string;
  data: {
    proposal: {
      id: string;
      number: string | null;
      title: string | null;
      status: string;
      client: { id: string | null; company_name: string | null; contact_email: string | null };
      totals: { monthly: number; one_time: number; currency: string };
      valid_until: string | null;
      signed_at: string | null;
      pdf_url: string | null;
    };
  };
}

export async function buildProposalPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  quoteId: string,
  type: WebhookEventType
): Promise<{ tenantId: string; payload: WebhookPayload } | null> {
  const { data: quote } = await db
    .from("quotes")
    .select("id, tenant_id, client_id, quote_number, title, status, selected_scenario_id, tax_rate, valid_until, signed_at, pdf_url")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;

  // Resolve the headline scenario the same way the invoice does.
  const { data: scenarios } = await db
    .from("quote_scenarios")
    .select("id, is_recommended, sort_order")
    .eq("quote_id", quoteId)
    .order("sort_order");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scenario = (scenarios ?? []).find((s: any) => s.is_recommended)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?? (scenarios ?? []).find((s: any) => s.id === quote.selected_scenario_id)
    ?? (scenarios ?? [])[0];

  let monthly = 0;
  let one_time = 0;
  if (scenario) {
    const { data: items } = await db
      .from("quote_line_items")
      .select("quantity, unit_price, setup_price, discount_percent, discount_amount, billing_period")
      .eq("scenario_id", scenario.id);
    for (const it of items ?? []) {
      const rev = lineRev(it);
      if (it.billing_period === "Monthly") monthly += rev;
      else one_time += rev;
      one_time += lineSetup(it); // setup fees are one-time, regardless of billing period
    }
  }

  let client: { id: string | null; company_name: string | null; contact_email: string | null } = {
    id: null, company_name: null, contact_email: null,
  };
  if (quote.client_id) {
    const { data: c } = await db
      .from("clients")
      .select("id, company_name, contact_email")
      .eq("id", quote.client_id)
      .maybeSingle();
    if (c) client = { id: c.id, company_name: c.company_name, contact_email: c.contact_email };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    tenantId: quote.tenant_id,
    payload: {
      id: newEventId(),
      type,
      api_version: WEBHOOK_API_VERSION,
      created_at: new Date().toISOString(),
      tenant_id: quote.tenant_id,
      data: {
        proposal: {
          id: quote.id,
          number: quote.quote_number ?? null,
          title: quote.title ?? null,
          status: quote.status,
          client,
          totals: { monthly: round2(monthly), one_time: round2(one_time), currency: "USD" },
          valid_until: quote.valid_until ?? null,
          signed_at: quote.signed_at ?? null,
          pdf_url: quote.pdf_url ?? null,
        },
      },
    },
  };
}
