import { lineRev, lineSetup } from "@/lib/pdf/serialize";

// Public API response shapes. Deliberately curated — we expose selling-side
// fields (prices, totals) and omit internal columns (unit_cost, margins,
// integration ids). Additive-only: never remove a field without an api_version bump.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Columns needed to serialize a proposal's detail. Deliberately does NOT include
// document_content (the BlockNote JSONB) — it's not in the output and can be
// megabytes (embedded base64 images), so selecting "*" made get_proposal slow
// enough to time out remote MCP clients. Keep in sync with serializeProposalDetail.
export const PROPOSAL_DETAIL_COLS =
  "id, quote_number, title, status, client_id, valid_until, sent_at, signed_at, pdf_url, created_at, updated_at, tax_rate, selected_scenario_id, source, source_detail";

export function serializeProposalSummary(q: any) {
  return {
    id: q.id,
    number: q.quote_number ?? null,
    title: q.title ?? null,
    status: q.status,
    client_id: q.client_id ?? null,
    valid_until: q.valid_until ?? null,
    sent_at: q.sent_at ?? null,
    signed_at: q.signed_at ?? null,
    pdf_url: q.pdf_url ?? null,
    created_at: q.created_at ?? null,
    updated_at: q.updated_at ?? null,
    // Provenance: how it was created (ui | api | mcp) + the caller name.
    source: q.source ?? "ui",
    source_detail: q.source_detail ?? null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function serializeLineItem(i: any) {
  return {
    description: i.description,
    details: i.details ?? null,
    billing_period: i.billing_period ?? null,
    quantity: Number(i.quantity),
    unit_price: i.unit_price == null ? null : Number(i.unit_price),
    setup_price: i.setup_price == null ? null : Number(i.setup_price),
    discount_percent: i.discount_percent == null ? 0 : Number(i.discount_percent),
    discount_amount: i.discount_amount == null ? 0 : Number(i.discount_amount),
    is_taxable: Boolean(i.is_taxable),
    line_total: round2(lineRev(i) + lineSetup(i)),
  };
}

// Totals for one scenario's items (setup folded into one-time), mirroring calcTotals.
function scenarioTotals(items: any[]) {
  let monthly = 0, one_time = 0;
  for (const i of items) {
    const rev = lineRev(i);
    if (i.billing_period === "Monthly") monthly += rev; else one_time += rev;
    one_time += lineSetup(i);
  }
  return { monthly: round2(monthly), one_time: round2(one_time), currency: "USD" };
}

export function serializeClient(c: any) {
  return {
    id: c.id,
    company_name: c.company_name,
    contact_name: c.contact_name ?? null,
    contact_email: c.contact_email ?? null,
    contact_phone: c.contact_phone ?? null,
    secondary_contact_name: c.secondary_contact_name ?? null,
    secondary_contact_email: c.secondary_contact_email ?? null,
    secondary_contact_phone: c.secondary_contact_phone ?? null,
    address: {
      street: c.address_street ?? null,
      suite: c.address_suite ?? null,
      city: c.address_city ?? null,
      state: c.address_state ?? null,
      postal: c.address_postal ?? null,
      country: c.address_country ?? null,
      legacy: c.address ?? null,
    },
    is_active: c.is_active ?? true,
    created_at: c.created_at ?? null,
  };
}

export function serializeProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    item_type: p.item_type ?? null,
    billing_period: p.billing_period ?? null,
    unit: p.unit ?? null,
    unit_price: p.unit_price == null ? null : Number(p.unit_price),
    setup_price: p.setup_price == null ? 0 : Number(p.setup_price),
    is_taxable: Boolean(p.is_taxable),
    is_active: p.is_active ?? true,
  };
}

// Full proposal detail: metadata + per-scenario tables + a headline totals block
// (recommended → selected → first scenario), matching the PDF/webhook numbers.
export function serializeProposalDetail(
  quote: any,
  scenarios: any[],
  itemsByScenario: Map<string, any[]>,
  client: any | null
) {
  const scenarioOut = scenarios.map((s) => {
    const items = itemsByScenario.get(s.id) ?? [];
    return {
      id: s.id,
      name: s.name,
      is_recommended: Boolean(s.is_recommended),
      sort_order: s.sort_order ?? 0,
      totals: scenarioTotals(items),
      line_items: items.map(serializeLineItem),
    };
  });
  const headline =
    scenarios.find((s) => s.is_recommended) ??
    scenarios.find((s) => s.id === quote.selected_scenario_id) ??
    scenarios[0];
  const totals = headline ? scenarioTotals(itemsByScenario.get(headline.id) ?? []) : { monthly: 0, one_time: 0, currency: "USD" };

  return {
    ...serializeProposalSummary(quote),
    tax_rate: quote.tax_rate == null ? null : Number(quote.tax_rate),
    totals,
    client: client ? serializeClient(client) : null,
    scenarios: scenarioOut,
  };
}
