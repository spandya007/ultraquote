import { getQboConfig, qboApiBase, QBO_MINOR_VERSION } from "./config";
import { refreshTokens } from "./oauth";
import { getConnectionSecrets, updateConnectionTokens } from "../store";

// Authenticated QBO REST client, keyed by tenant. Handles access-token refresh
// (persisting the newest refresh token — the #1 QBO footgun) and per-company
// base-URL/realmId. docs/integrations-accounting-psa-research.md §3.

// Refresh if the access token expires within this window.
const REFRESH_SKEW_MS = 2 * 60 * 1000;

// Serialize refresh per-tenant within this process to avoid a token race when
// two signed-webhooks land together. (Single-region; not a distributed lock.)
const refreshLocks = new Map<string, Promise<string>>();

async function getValidAccessToken(tenantId: string): Promise<{ accessToken: string; realmId: string }> {
  const conn = await getConnectionSecrets(tenantId, "qbo");
  if (!conn || !conn.refreshToken || !conn.accountRef) {
    throw new Error("QuickBooks is not connected for this tenant.");
  }
  const realmId = conn.accountRef;

  const expired =
    !conn.accessToken ||
    !conn.expiresAt ||
    new Date(conn.expiresAt).getTime() - Date.now() < REFRESH_SKEW_MS;

  if (!expired && conn.accessToken) {
    return { accessToken: conn.accessToken, realmId };
  }

  // Deduplicate concurrent refreshes for the same tenant.
  const existing = refreshLocks.get(tenantId);
  if (existing) return { accessToken: await existing, realmId };

  const p = (async () => {
    const tokens = await refreshTokens(conn.refreshToken!);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    // Persist the NEWEST refresh token — always, or the auth chain revokes.
    await updateConnectionTokens({
      tenantId,
      provider: "qbo",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });
    return tokens.access_token;
  })();
  refreshLocks.set(tenantId, p);
  try {
    const accessToken = await p;
    return { accessToken, realmId };
  } finally {
    refreshLocks.delete(tenantId);
  }
}

async function qboFetch<T = unknown>(
  tenantId: string,
  path: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<T> {
  const { env } = getQboConfig();
  const { accessToken, realmId } = await getValidAccessToken(tenantId);
  const base = qboApiBase(env);
  const params = new URLSearchParams({ minorversion: QBO_MINOR_VERSION, ...(init?.query ?? {}) });
  const url = `${base}/v3/company/${realmId}/${path}?${params.toString()}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QBO ${path} failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

// Escape a value for a QBO SQL-ish query string.
function q(value: string): string {
  return value.replace(/'/g, "\\'");
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function findOrCreateCustomer(
  tenantId: string,
  client: { company_name: string; contact_email: string | null }
): Promise<string> {
  const name = client.company_name.trim();
  const found = await qboFetch<{ QueryResponse?: { Customer?: Array<{ Id: string }> } }>(tenantId, "query", {
    method: "GET",
    query: { query: `select Id from Customer where DisplayName = '${q(name)}'` },
  });
  const existing = found.QueryResponse?.Customer?.[0]?.Id;
  if (existing) return existing;

  const created = await qboFetch<{ Customer: { Id: string } }>(tenantId, "customer", {
    method: "POST",
    body: JSON.stringify({
      DisplayName: name,
      ...(client.contact_email ? { PrimaryEmailAddr: { Address: client.contact_email } } : {}),
    }),
  });
  return created.Customer.Id;
}

// ── Items (a single fallback service item; per-line description carries detail) ──

export async function getDefaultIncomeAccountId(tenantId: string): Promise<string> {
  const res = await qboFetch<{ QueryResponse?: { Account?: Array<{ Id: string }> } }>(tenantId, "query", {
    method: "GET",
    query: { query: "select Id from Account where AccountType = 'Income' maxresults 1" },
  });
  const id = res.QueryResponse?.Account?.[0]?.Id;
  if (!id) throw new Error("No Income account found in QuickBooks.");
  return id;
}

// QBO Item names must be unique, <= 100 chars, and cannot contain ':' (that
// denotes sub-items). Sanitize + fall back so we never send an invalid name.
export function sanitizeItemName(name: string): string {
  const cleaned = name.replace(/:/g, "-").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned || "SmartProps Services";
}

// Find-or-create a Service item by (sanitized) name. Used per distinct product
// name so the invoice's Product/Service column shows the real item.
export async function findOrCreateServiceItem(tenantId: string, rawName: string): Promise<string> {
  const name = sanitizeItemName(rawName);
  const found = await qboFetch<{ QueryResponse?: { Item?: Array<{ Id: string }> } }>(tenantId, "query", {
    method: "GET",
    query: { query: `select Id from Item where Name = '${q(name)}'` },
  });
  const existing = found.QueryResponse?.Item?.[0]?.Id;
  if (existing) return existing;

  const incomeAccountId = await getDefaultIncomeAccountId(tenantId);
  const created = await qboFetch<{ Item: { Id: string } }>(tenantId, "item", {
    method: "POST",
    body: JSON.stringify({
      Name: name,
      Type: "Service",
      IncomeAccountRef: { value: incomeAccountId },
    }),
  });
  return created.Item.Id;
}

// ── Invoices ────────────────────────────────────────────────────────────────

export interface QboInvoiceLine {
  itemId: string;      // QBO Item (Product/Service) reference for this line
  description: string; // free-text Description shown on the line
  quantity: number;
  unitPrice: number;
  amount: number;
  taxable: boolean;    // whether QBO should tax this line (rate computed by QBO)
}

export async function createInvoice(
  tenantId: string,
  params: { customerId: string; lines: QboInvoiceLine[]; docNumber?: string }
): Promise<string> {
  const Line = params.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: Math.round(l.amount * 100) / 100,
    Description: l.description.slice(0, 4000),
    SalesItemLineDetail: {
      ItemRef: { value: l.itemId },
      Qty: l.quantity,
      UnitPrice: Math.round(l.unitPrice * 100) / 100,
      // We DON'T mirror our own tax rate — QBO is authoritative for tax. We only
      // flag taxability per line; QBO's Automated Sales Tax computes the actual
      // rate from the customer's address. TAX/NON are the US/AST reserved codes.
      // (Non-AST/manual-tax companies would need a real TaxCode id — deferred.)
      TaxCodeRef: { value: l.taxable ? "TAX" : "NON" },
    },
  }));
  const created = await qboFetch<{ Invoice: { Id: string } }>(tenantId, "invoice", {
    method: "POST",
    body: JSON.stringify({
      CustomerRef: { value: params.customerId },
      Line,
      ...(params.docNumber ? { DocNumber: params.docNumber.slice(0, 21) } : {}),
    }),
  });
  return created.Invoice.Id;
}
