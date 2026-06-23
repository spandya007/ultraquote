import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveStatus } from "@/lib/quote-status";
import type { QuoteStatus } from "@/types";

// Builds a "what's in this tenant's workspace" dossier — counts for everything,
// plus itemized lists for the risk-flagged items (in-flight + signed quotes,
// open signature sessions, active products). Used by the platform-admin tenant
// detail page, the downloadable report, and the tenant-owner self-view, so they
// all agree. Service-role only (platform/cross-tenant data).

export interface DossierQuote {
  id: string;
  quote_number: string;
  title: string | null;
  status: QuoteStatus;
  effective_status: QuoteStatus;
  client_name: string | null;
  valid_until: string | null;
  updated_at: string;
  value: number | null; // recommended-scenario line-item subtotal, if computable
}

export interface DossierProduct {
  id: string;
  name: string;
  category: string | null;
  item_type: string | null;
  billing_period: string | null;
  unit_price: number | null;
}

export interface TenantDossier {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    created_at: string;
    subscription_end: string | null;
    subscription_term: string | null;
    platform_enabled: boolean;
  };
  owner: { full_name: string | null; email: string } | null;
  users: { id: string; email: string; full_name: string | null; role: string; enabled: boolean }[];
  counts: {
    clients: number;
    products: number;
    productsActive: number;
    productCategories: number;
    productPricingTiers: number;
    templates: number;
    quotesTotal: number;
    quotesByStatus: Record<string, number>;
    quoteScenarios: number;
    quoteLineItems: number;
    quoteSigners: number;
    signatureSessions: number;
    signatureSessionsOpen: number;
    productAudit: number;
    storageLogoFiles: number;
  };
  flagged: {
    inFlightQuotes: DossierQuote[]; // sent / viewed (awaiting client signature)
    signedQuotes: DossierQuote[]; // executed contracts
    declinedQuotes: DossierQuote[];
    activeProducts: DossierProduct[];
  };
  generatedAt: string;
}

export async function getTenantDossier(tenantId: string): Promise<TenantDossier | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, email, created_at, subscription_end, subscription_term, platform_enabled")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) return null;

  const [usersRes, clientsRes, catsRes, productsRes, quotesRes, auditRes, templatesRes] =
    await Promise.all([
      admin.from("users").select("id, email, full_name, role, enabled").eq("tenant_id", tenantId),
      admin.from("clients").select("id, company_name").eq("tenant_id", tenantId),
      admin.from("product_categories").select("id, name").eq("tenant_id", tenantId),
      admin
        .from("products")
        .select("id, name, category_id, item_type, billing_period, unit_price, is_active")
        .eq("tenant_id", tenantId),
      admin
        .from("quotes")
        .select("id, quote_number, title, status, valid_until, updated_at, client_id, signed_at")
        .eq("tenant_id", tenantId),
      admin.from("product_audit").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      admin.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);

  const users = (usersRes.data ?? []) as TenantDossier["users"];
  const clients = (clientsRes.data ?? []) as { id: string; company_name: string }[];
  const cats = (catsRes.data ?? []) as { id: string; name: string }[];
  const products = (productsRes.data ?? []) as {
    id: string; name: string; category_id: string | null; item_type: string | null;
    billing_period: string | null; unit_price: number | null; is_active: boolean;
  }[];
  const quotes = (quotesRes.data ?? []) as {
    id: string; quote_number: string; title: string | null; status: QuoteStatus;
    valid_until: string | null; updated_at: string; client_id: string; signed_at: string | null;
  }[];

  const clientName = new Map(clients.map((c) => [c.id, c.company_name]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  // Child rows reached via quote/product ids (not tenant-scoped directly).
  const quoteIds = quotes.map((q) => q.id);
  const productIds = products.map((p) => p.id);

  const [scenRes, signersRes, sessRes, tiersRes] = await Promise.all([
    quoteIds.length
      ? admin.from("quote_scenarios").select("id, quote_id, is_recommended").in("quote_id", quoteIds)
      : Promise.resolve({ data: [] }),
    quoteIds.length
      ? admin.from("quote_signers").select("id", { count: "exact", head: true }).in("quote_id", quoteIds)
      : Promise.resolve({ count: 0 }),
    quoteIds.length
      ? admin.from("quote_signature_sessions").select("status").in("quote_id", quoteIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? admin.from("product_pricing_tiers").select("id", { count: "exact", head: true }).in("product_id", productIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const scenarios = (scenRes.data ?? []) as { id: string; quote_id: string; is_recommended: boolean }[];
  const scenarioIds = scenarios.map((s) => s.id);
  const recommendedByQuote = new Map<string, string>();
  for (const s of scenarios) {
    if (s.is_recommended && !recommendedByQuote.has(s.quote_id)) recommendedByQuote.set(s.quote_id, s.id);
  }
  // Fallback: a quote with no recommended scenario uses its first scenario.
  for (const s of scenarios) if (!recommendedByQuote.has(s.quote_id)) recommendedByQuote.set(s.quote_id, s.id);

  const liRes = scenarioIds.length
    ? await admin.from("quote_line_items").select("scenario_id, line_total").in("scenario_id", scenarioIds)
    : { data: [] };
  const lineItems = (liRes.data ?? []) as { scenario_id: string; line_total: number | null }[];

  const valueByScenario = new Map<string, number>();
  for (const li of lineItems) {
    valueByScenario.set(li.scenario_id, (valueByScenario.get(li.scenario_id) ?? 0) + Number(li.line_total ?? 0));
  }
  const quoteValue = (quoteId: string): number | null => {
    const scen = recommendedByQuote.get(quoteId);
    return scen ? valueByScenario.get(scen) ?? 0 : null;
  };

  const sessions = (sessRes.data ?? []) as { status: string }[];

  // Build per-quote view with derived effective status, group + flag.
  const quotesByStatus: Record<string, number> = {};
  const toDossierQuote = (q: (typeof quotes)[number]): DossierQuote => ({
    id: q.id,
    quote_number: q.quote_number,
    title: q.title,
    status: q.status,
    effective_status: effectiveStatus(q),
    client_name: clientName.get(q.client_id) ?? null,
    valid_until: q.valid_until,
    updated_at: q.updated_at,
    value: quoteValue(q.id),
  });

  const inFlightQuotes: DossierQuote[] = [];
  const signedQuotes: DossierQuote[] = [];
  const declinedQuotes: DossierQuote[] = [];
  for (const q of quotes) {
    const eff = effectiveStatus(q);
    quotesByStatus[eff] = (quotesByStatus[eff] ?? 0) + 1;
    if (eff === "sent" || eff === "viewed") inFlightQuotes.push(toDossierQuote(q));
    else if (eff === "signed") signedQuotes.push(toDossierQuote(q));
    else if (eff === "declined") declinedQuotes.push(toDossierQuote(q));
  }
  const byUpdated = (a: DossierQuote, b: DossierQuote) => b.updated_at.localeCompare(a.updated_at);
  inFlightQuotes.sort(byUpdated);
  signedQuotes.sort(byUpdated);
  declinedQuotes.sort(byUpdated);

  const activeProducts: DossierProduct[] = products
    .filter((p) => p.is_active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category_id ? catName.get(p.category_id) ?? null : null,
      item_type: p.item_type,
      billing_period: p.billing_period,
      unit_price: p.unit_price,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Best-effort storage count (the tenant's logo folder; proposal images live
  // under per-quote paths and aren't enumerated here).
  let storageLogoFiles = 0;
  try {
    const { data: files } = await admin.storage.from("proposal-assets").list(`tenant-logos/${tenantId}`);
    storageLogoFiles = (files ?? []).length;
  } catch {
    /* bucket/path may not exist — ignore */
  }

  const owner = users.find((u) => u.role === "owner") ?? null;

  return {
    tenant,
    owner: owner ? { full_name: owner.full_name, email: owner.email } : null,
    users,
    counts: {
      clients: clients.length,
      products: products.length,
      productsActive: activeProducts.length,
      productCategories: cats.length,
      productPricingTiers: (tiersRes as { count?: number }).count ?? 0,
      templates: (templatesRes as { count?: number }).count ?? 0,
      quotesTotal: quotes.length,
      quotesByStatus,
      quoteScenarios: scenarios.length,
      quoteLineItems: lineItems.length,
      quoteSigners: (signersRes as { count?: number }).count ?? 0,
      signatureSessions: sessions.length,
      signatureSessionsOpen: sessions.filter((s) => s.status === "pending").length,
      productAudit: (auditRes as { count?: number }).count ?? 0,
      storageLogoFiles,
    },
    flagged: { inFlightQuotes, signedQuotes, declinedQuotes, activeProducts },
    generatedAt: new Date().toISOString(),
  };
}
