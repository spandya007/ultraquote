import { type TenantDossier, type DossierQuote } from "@/lib/admin/tenant-dossier";
import { formatCurrency } from "@/lib/utils/format";

// Renders a print-ready, self-contained HTML report of a tenant's workspace
// (counts + flagged items). Shared by the Platform Admin report route and the
// Org Admin report route so they stay identical. The caller is responsible for
// authorization (platform admin, or org admin scoped to their org).

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

function quoteRows(quotes: DossierQuote[]): string {
  return quotes
    .map(
      (q) => `<tr>
      <td><code>${esc(q.quote_number)}</code>${q.title ? `<div class="sub">${esc(q.title)}</div>` : ""}</td>
      <td>${esc(q.client_name ?? "—")}</td>
      <td><span class="pill ${esc(q.effective_status)}">${esc(q.effective_status)}</span></td>
      <td class="num">${q.value != null ? esc(formatCurrency(q.value)) : "—"}</td>
      <td>${fmtDate(q.valid_until)}</td>
    </tr>`
    )
    .join("");
}

// hideProductDetail: Org Admin reports (Oversight tier) show the product COUNT
// but omit the active-products list (names/prices are confidential catalog data).
export function renderTenantReport(d: TenantDossier, opts: { hideProductDetail?: boolean } = {}): string {
  const c = d.counts;
  const f = d.flagged;
  const manifest: [string, number][] = [
    ["Clients", c.clients],
    ["Products", c.products],
    ["Pricing tiers", c.productPricingTiers],
    ["Product categories", c.productCategories],
    ["Templates", c.templates],
    ["Quotes", c.quotesTotal],
    ["Quote scenarios", c.quoteScenarios],
    ["Line items", c.quoteLineItems],
    ["Signers", c.quoteSigners],
    ["Signature sessions", c.signatureSessions],
    ["Team members", d.users.length],
    ["Stored logo files", c.storageLogoFiles],
  ];

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>UltraQuote workspace summary — ${esc(d.tenant.name)}</title>
<style>
  @page { size: Letter; margin: 18mm; }
  :root{ --brand:#2563eb; --teal:#0ea5a4; --ink:#0b1f3a; --muted:#64748b; --line:#e2e8f0; }
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);margin:0;font-size:13px;line-height:1.5}
  .band{background:linear-gradient(135deg,var(--brand),var(--teal));color:#fff;padding:22px 26px;border-radius:12px}
  .band h1{margin:0 0 4px;font-size:22px} .band .meta{opacity:.95;font-size:13px}
  h2{font-size:15px;margin:26px 0 10px;color:var(--ink)}
  .note{background:#ecfeff;border:1px solid #ccfbf1;border-radius:10px;padding:12px 16px;margin-top:18px;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:6px} th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--line);vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums} code{font-size:12px} .sub{color:var(--muted);font-size:11px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 28px;margin-top:6px}
  .grid .row{display:flex;justify-content:space-between;border-bottom:1px dashed var(--line);padding:4px 0}
  .pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600;text-transform:capitalize;background:#f1f5f9;color:#475569}
  .pill.sent{background:#dbeafe;color:#1d4ed8} .pill.viewed{background:#ede9fe;color:#6d28d9}
  .pill.signed{background:#dcfce7;color:#15803d} .pill.declined{background:#fee2e2;color:#b91c1c} .pill.expired{background:#ffedd5;color:#c2410c}
  .risk{border:1px solid;border-radius:8px;padding:8px 12px;margin:6px 0;font-size:13px}
  .risk.danger{background:#fef2f2;border-color:#fecaca;color:#b91c1c} .risk.warning{background:#fffbeb;border-color:#fde68a;color:#b45309} .risk.info{background:#eff6ff;border-color:#bfdbfe;color:#1e40af}
  .foot{margin-top:28px;color:var(--muted);font-size:11px;border-top:1px solid var(--line);padding-top:10px}
  @media print{ .band{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
</style></head><body>

<div class="band">
  <h1>Your UltraQuote workspace summary</h1>
  <div class="meta">${esc(d.tenant.name)}${d.owner ? ` · ${esc(d.owner.email)}` : ""} · generated ${fmtDate(d.generatedAt)}</div>
</div>

<div class="note">
  This is a summary of everything currently stored in your UltraQuote workspace. Please review it and
  save copies of anything you need to keep (you can download individual quotes as PDFs; contact
  hello@ultraquote.io if you need a full copy of your data). In-flight (sent) and signed quotes are
  highlighted below — those represent active or completed deals worth saving before any changes are
  made to your account.
</div>

${
  f.signedQuotes.length
    ? `<div class="risk danger">${f.signedQuotes.length} signed quote(s) — executed contracts.</div>`
    : ""
}${
    f.inFlightQuotes.length
      ? `<div class="risk warning">${f.inFlightQuotes.length} quote(s) sent and awaiting client signature.</div>`
      : ""
  }${
    c.productsActive
      ? `<div class="risk info">${c.productsActive} active catalog product(s).</div>`
      : ""
  }

<h2>At a glance</h2>
<div class="grid">
  ${manifest.map(([l, n]) => `<div class="row"><span>${esc(l)}</span><strong>${n}</strong></div>`).join("")}
</div>

${
  f.signedQuotes.length
    ? `<h2>Signed quotes (executed contracts)</h2>
<table><thead><tr><th>Quote</th><th>Client</th><th>Status</th><th class="num">Value</th><th>Valid until</th></tr></thead>
<tbody>${quoteRows(f.signedQuotes)}</tbody></table>`
    : ""
}

${
  f.inFlightQuotes.length
    ? `<h2>In-flight quotes (sent / viewed)</h2>
<table><thead><tr><th>Quote</th><th>Client</th><th>Status</th><th class="num">Value</th><th>Valid until</th></tr></thead>
<tbody>${quoteRows(f.inFlightQuotes)}</tbody></table>`
    : ""
}

${
  !opts.hideProductDetail && f.activeProducts.length
    ? `<h2>Active catalog products (${f.activeProducts.length})</h2>
<table><thead><tr><th>Product</th><th>Category</th><th>Type</th><th class="num">Unit price</th></tr></thead>
<tbody>${f.activeProducts
        .map(
          (p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category ?? "—")}</td><td>${esc(p.item_type ?? "—")}${
            p.billing_period ? ` · ${esc(p.billing_period)}` : ""
          }</td><td class="num">${p.unit_price != null ? esc(formatCurrency(p.unit_price)) : "—"}</td></tr>`
        )
        .join("")}</tbody></table>`
    : ""
}

<div class="foot">UltraQuote · Proposals &amp; quoting for modern teams · hello@ultraquote.io · app.ultraquote.io</div>
</body></html>`;
}
