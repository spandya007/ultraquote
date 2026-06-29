import { describe, it, expect } from "vitest";
import { renderTenantReport } from "./tenant-report";
import type { TenantDossier, DossierQuote, DossierProduct } from "./tenant-dossier";

// Pure-function coverage for the shared workspace report renderer. The most
// important behavior to pin is hideProductDetail — the Org Admin (Oversight)
// report shows the product COUNT but must omit the catalog product list
// (names/prices are confidential), whereas the Platform Admin report includes it.

const quote = (over: Partial<DossierQuote> = {}): DossierQuote => ({
  id: "q1",
  quote_number: "CMIT-2026-001",
  title: "Managed Services",
  status: "signed",
  effective_status: "signed",
  client_name: "Beta Client",
  valid_until: "2026-07-01",
  updated_at: "2026-06-20T00:00:00Z",
  value: 1200,
  ...over,
});

const product = (over: Partial<DossierProduct> = {}): DossierProduct => ({
  id: "p1",
  name: "SuperSecret Firewall Tier",
  category: "Security",
  item_type: "recurring",
  billing_period: "monthly",
  unit_price: 99,
  ...over,
});

function makeDossier(over: Partial<TenantDossier> = {}): TenantDossier {
  const base: TenantDossier = {
    tenant: {
      id: "t1",
      name: "Acme Workspace",
      email: "owner@acme.test",
      created_at: "2026-01-01T00:00:00Z",
      subscription_end: null,
      subscription_term: null,
      platform_enabled: true,
      deletion_scheduled_at: null,
      deletion_reason: null,
    },
    owner: { full_name: "Acme Owner", email: "owner@acme.test" },
    users: [{ id: "u1", email: "owner@acme.test", full_name: "Acme Owner", role: "owner", enabled: true }],
    counts: {
      clients: 3,
      products: 7,
      productsActive: 5,
      productCategories: 2,
      productPricingTiers: 9,
      templates: 1,
      quotesTotal: 4,
      quotesByStatus: { signed: 1, draft: 3 },
      quoteScenarios: 6,
      quoteLineItems: 20,
      quoteSigners: 2,
      signatureSessions: 1,
      signatureSessionsOpen: 0,
      productAudit: 0,
      storageLogoFiles: 1,
    },
    flagged: {
      inFlightQuotes: [],
      signedQuotes: [],
      declinedQuotes: [],
      activeProducts: [product()],
    },
    generatedAt: "2026-06-29T00:00:00Z",
  };
  return { ...base, ...over };
}

describe("renderTenantReport — hideProductDetail (Org Admin redaction)", () => {
  it("OMITS the active-products list when hideProductDetail is true", () => {
    const html = renderTenantReport(makeDossier(), { hideProductDetail: true });
    expect(html).not.toContain("SuperSecret Firewall Tier");
    expect(html).not.toContain("Active catalog products");
  });

  it("still reports the product COUNT even when detail is hidden", () => {
    const html = renderTenantReport(makeDossier(), { hideProductDetail: true });
    // The "At a glance" manifest row pairs the label with the count.
    expect(html).toMatch(/Products<\/span><strong>7<\/strong>/);
  });

  it("INCLUDES the active-products list by default (Platform Admin report)", () => {
    const html = renderTenantReport(makeDossier());
    expect(html).toContain("Active catalog products");
    expect(html).toContain("SuperSecret Firewall Tier");
  });

  it("omits the products list when there are no active products, regardless of flag", () => {
    const d = makeDossier();
    d.flagged.activeProducts = [];
    expect(renderTenantReport(d)).not.toContain("Active catalog products");
  });
});

describe("renderTenantReport — risk banners", () => {
  it("flags signed quotes as executed contracts", () => {
    const d = makeDossier();
    d.flagged.signedQuotes = [quote({ effective_status: "signed" })];
    const html = renderTenantReport(d);
    expect(html).toContain("1 signed quote(s) — executed contracts.");
    expect(html).toContain("Signed quotes (executed contracts)");
  });

  it("flags in-flight quotes awaiting signature", () => {
    const d = makeDossier();
    d.flagged.inFlightQuotes = [quote({ effective_status: "sent" })];
    const html = renderTenantReport(d);
    expect(html).toContain("awaiting client signature");
  });

  it("shows no contract/in-flight banners for a clean workspace", () => {
    const html = renderTenantReport(makeDossier());
    expect(html).not.toContain("executed contracts");
    expect(html).not.toContain("awaiting client signature");
  });
});

describe("renderTenantReport — output safety", () => {
  it("HTML-escapes the tenant name (no raw markup injection)", () => {
    const d = makeDossier();
    d.tenant.name = '<script>alert("x")</script>';
    const html = renderTenantReport(d);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders self-contained HTML with the tenant name in the header", () => {
    const html = renderTenantReport(makeDossier());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("Acme Workspace");
  });
});
