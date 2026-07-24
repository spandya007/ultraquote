import type { ScopedDb } from "@/lib/api/scoped";
import { lineRev, lineSetup } from "@/lib/pdf/serialize";

// Shared proposal write logic used by BOTH the public REST API (POST
// /api/v1/proposals) and the MCP write tools. Everything is tenant-scoped via
// ScopedDb. Child tables (quote_scenarios, quote_line_items) have no tenant_id,
// so we ALWAYS verify the parent up the chain through a tenant-scoped select
// before writing — the same #1 isolation rule as the read paths.

export class MutationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "MutationError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// Allocate the next proposal number for API/MCP (service-role) callers. The
// next_quote_number() RPC can't be used here — it's security-definer and requires
// an auth.uid() tenant member, which service-role requests don't have. Service-
// role bypasses RLS, so we do the atomic bump directly via a compare-and-swap on
// tenant_settings.quote_number_sequence (retry on lost race). Matches the RPC's
// semantics exactly: issue the current sequence value S, store S+1.
async function allocateQuoteNumber(db: ScopedDb): Promise<string> {
  const admin = db.admin;
  const tenantId = db.tenantId;
  await admin.from("tenant_settings").upsert({ tenant_id: tenantId }, { onConflict: "tenant_id", ignoreDuplicates: true });
  const year = new Date().getFullYear();
  for (let i = 0; i < 6; i++) {
    const { data: s } = await admin
      .from("tenant_settings")
      .select("quote_number_prefix, quote_number_sequence")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!s) throw new MutationError("number_alloc_failed", "Tenant settings not found.");
    const seq: number = s.quote_number_sequence ?? 1;
    const { data: updated } = await admin
      .from("tenant_settings")
      .update({ quote_number_sequence: seq + 1 })
      .eq("tenant_id", tenantId)
      .eq("quote_number_sequence", seq) // CAS: only if unchanged
      .select("tenant_id");
    if (updated && updated.length > 0) {
      return `${s.quote_number_prefix ?? "PROP"}-${year}-${String(seq).padStart(3, "0")}`;
    }
  }
  throw new MutationError("number_alloc_failed", "Could not allocate a proposal number (contention).");
}

// Recompute + persist a scenario's denormalized totals from its line items.
async function refreshScenarioTotals(db: ScopedDb, scenarioId: string, taxRate: number) {
  const { data: items } = await db
    .child("quote_line_items")
    .select("quantity, unit_price, setup_price, discount_percent, discount_amount, billing_period, is_taxable")
    .eq("scenario_id", scenarioId);
  const rows = (items ?? []) as any[];
  let monthly = 0, onetime = 0, taxable = 0;
  for (const i of rows) {
    const rev = lineRev(i);
    if (i.billing_period === "Monthly") monthly += rev; else onetime += rev;
    onetime += lineSetup(i);
    if (i.is_taxable) taxable += lineRev(i) + lineSetup(i);
  }
  const tax = Math.round(taxable * taxRate * 100) / 100;
  await db.child("quote_scenarios").update({
    monthly_recurring_total: Math.round(monthly * 100) / 100,
    onetime_total: Math.round(onetime * 100) / 100,
    tax_amount: tax,
  }).eq("id", scenarioId);
}

export async function createProposal(
  db: ScopedDb,
  input: {
    clientId: string; title?: string | null; validUntil?: string | null; createdBy?: string | null;
    // Provenance (migration 035): where the proposal came from + the caller name.
    source?: "ui" | "api" | "mcp"; sourceDetail?: string | null;
  }
): Promise<{ id: string; quote_number: string; title: string | null; status: string }> {
  const clientId = String(input.clientId ?? "").trim();
  if (!clientId) throw new MutationError("invalid_request", "client_id is required.");

  const { data: client } = await db.select("clients", "id").eq("id", clientId).maybeSingle();
  if (!client) throw new MutationError("client_not_found", "Client not found in this workspace.");

  const title = input.title?.trim() || null;
  if (title) {
    const { data: dup } = await db.select("quotes", "id").ilike("title", title).limit(1).maybeSingle();
    if (dup) throw new MutationError("duplicate_title", "A proposal with this title already exists.");
  }

  const { data: settings } = await db.select("tenant_settings", "default_tax_rate").maybeSingle();

  const quoteNumber = await allocateQuoteNumber(db);

  const { data: quote, error: qErr } = await db.insertOne("quotes", {
    created_by: input.createdBy ?? null,
    client_id: clientId,
    title,
    status: "draft",
    valid_until: input.validUntil ?? null,
    quote_number: quoteNumber,
    tax_rate: (settings as any)?.default_tax_rate ?? null,
    source: input.source ?? "api",
    source_detail: input.sourceDetail ?? null,
  });
  if (qErr || !quote) throw new MutationError("insert_failed", qErr?.message ?? "Failed to create the proposal.");

  // Default scenario (child table → set the FK explicitly).
  await db.child("quote_scenarios").insert({ quote_id: quote.id, name: "Scenario A", is_recommended: true, sort_order: 0 });

  return { id: quote.id, quote_number: quote.quote_number, title: quote.title ?? null, status: quote.status };
}

// Verifies a scenario belongs to the tenant (via its quote) and returns
// { scenarioId, quoteId, taxRate }. Throws if not found / not this tenant.
async function assertScenarioInTenant(db: ScopedDb, scenarioId: string) {
  const { data: scenario } = await db.child("quote_scenarios").select("id, quote_id").eq("id", scenarioId).maybeSingle();
  if (!scenario) throw new MutationError("scenario_not_found", "Scenario not found.");
  // The quote read is tenant-scoped — if it returns nothing, the scenario belongs
  // to another tenant.
  const { data: quote } = await db.select("quotes", "id, tax_rate").eq("id", (scenario as any).quote_id).maybeSingle();
  if (!quote) throw new MutationError("scenario_not_found", "Scenario not found.");
  return { scenarioId, quoteId: (quote as any).id, taxRate: Number((quote as any).tax_rate ?? 0) };
}

export async function addScenario(
  db: ScopedDb,
  input: { quoteId: string; name?: string | null }
): Promise<{ id: string; name: string; sort_order: number }> {
  const { data: quote } = await db.select("quotes", "id").eq("id", input.quoteId).maybeSingle();
  if (!quote) throw new MutationError("proposal_not_found", "Proposal not found in this workspace.");

  const { data: existing } = await db.child("quote_scenarios").select("sort_order").eq("quote_id", input.quoteId).order("sort_order", { ascending: false }).limit(1);
  const nextSort = ((existing?.[0] as any)?.sort_order ?? -1) + 1;
  const name = input.name?.trim() || `Scenario ${String.fromCharCode(65 + nextSort)}`;

  const { data: scenario, error } = await db.child("quote_scenarios")
    .insert({ quote_id: input.quoteId, name, is_recommended: false, sort_order: nextSort })
    .select("id, name, sort_order").single();
  if (error || !scenario) throw new MutationError("insert_failed", error?.message ?? "Failed to add scenario.");
  return scenario as any;
}

export async function addLineItem(
  db: ScopedDb,
  input: {
    scenarioId: string;
    productId?: string | null;
    description?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    billingPeriod?: "Monthly" | "One Time" | null;
    setupPrice?: number | null;
    isTaxable?: boolean | null;
    details?: string | null;
  }
): Promise<{ id: string; description: string }> {
  const { scenarioId, taxRate } = await assertScenarioInTenant(db, input.scenarioId);
  const quantity = input.quantity != null && input.quantity > 0 ? input.quantity : 1;

  let payload: Record<string, unknown>;
  if (input.productId) {
    const { data: product } = await db.select("products", "id, name, description, billing_period, unit_cost, unit_price, setup_price, is_taxable").eq("id", input.productId).maybeSingle();
    if (!product) throw new MutationError("product_not_found", "Product not found in this workspace.");
    const p = product as any;
    payload = {
      product_id: p.id,
      description: p.name,
      details: p.description ?? null,
      billing_period: p.billing_period ?? null,
      quantity,
      unit_cost: p.unit_cost,
      unit_price: input.unitPrice ?? p.unit_price,
      setup_price: input.setupPrice ?? p.setup_price ?? 0,
      is_taxable: input.isTaxable ?? p.is_taxable ?? false,
    };
  } else {
    const description = input.description?.trim();
    if (!description) throw new MutationError("invalid_request", "Either product_id or description is required.");
    payload = {
      description,
      details: input.details ?? null,
      billing_period: input.billingPeriod ?? "One Time",
      quantity,
      unit_price: input.unitPrice ?? 0,
      setup_price: input.setupPrice ?? 0,
      is_taxable: input.isTaxable ?? false,
    };
  }

  const { data: countRows } = await db.child("quote_line_items").select("id").eq("scenario_id", scenarioId);
  const sortOrder = (countRows?.length ?? 0);

  const { data: item, error } = await db.child("quote_line_items")
    .insert({ scenario_id: scenarioId, sort_order: sortOrder, discount_percent: 0, discount_amount: 0, ...payload })
    .select("id, description").single();
  if (error || !item) throw new MutationError("insert_failed", error?.message ?? "Failed to add line item.");

  await refreshScenarioTotals(db, scenarioId, taxRate);
  return item as any;
}
