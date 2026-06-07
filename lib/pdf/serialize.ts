import type {
  SerializeInput,
  SerializeScenario,
  DocBlock,
  InlineContent,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

// ─── Token substitution ───────────────────────────────────────────────────────

function buildTokenMap(input: SerializeInput): Record<string, string> {
  const { client, tenant } = input;
  return {
    "{{client.company_name}}": client.company_name || "",
    "{{client.contact_name}}": client.contact_name || "",
    "{{client.email}}":         client.contact_email || "",
    "{{client.phone}}":         client.contact_phone || "",
    "{{client.address}}":       client.address || "",
    "{{tenant.company_name}}": tenant.name || "",
    "{{tenant.contact_name}}": tenant.contact_name || "",
    "{{tenant.email}}":         tenant.email || "",
    "{{tenant.phone}}":         tenant.phone || "",
    "{{tenant.address}}":       tenant.address || "",
  };
}

function substituteTokens(text: string, tokenMap: Record<string, string>): string {
  return text.replace(/\{\{(client|tenant)\.\w+\}\}/g, (match) =>
    match in tokenMap ? tokenMap[match] : match
  );
}

// ─── Inline content ────────────────────────────────────────────────────────────

function renderInline(content: InlineContent[] | string | undefined, tokenMap: Record<string, string>): string {
  if (!content) return "";
  if (typeof content === "string") return escapeHtml(substituteTokens(content, tokenMap));

  return content
    .map((node) => {
      if (node.type === "link") {
        // Links carry nested content of their own.
        const inner = Array.isArray(node.content)
          ? renderInline(node.content as InlineContent[], tokenMap)
          : escapeHtml(substituteTokens(node.text ?? "", tokenMap));
        const href = node.href ?? "#";
        return `<a href="${escapeHtml(href)}">${inner}</a>`;
      }

      const raw = node.text ?? "";
      let html = escapeHtml(substituteTokens(raw, tokenMap));
      // Variable tokens are inserted with a blue/white "chip" style in the
      // editor. In the rendered output, keep any real formatting the author
      // applied (bold, italic, underline, strike) but drop ONLY the chip's
      // background/text color so the value is black-and-white.
      const isToken = /\{\{(client|tenant)\.\w+\}\}/.test(raw);
      const styles = { ...(node.styles ?? {}) };
      if (isToken) {
        delete styles.backgroundColor;
        delete styles.textColor;
      }

      if (styles.bold) html = `<strong>${html}</strong>`;
      if (styles.italic) html = `<em>${html}</em>`;
      if (styles.underline) html = `<u>${html}</u>`;
      if (styles.strike) html = `<s>${html}</s>`;
      if (styles.code) html = `<code>${html}</code>`;

      const css: string[] = [];
      if (styles.textColor && styles.textColor !== "default") css.push(`color:${styles.textColor}`);
      if (styles.backgroundColor && styles.backgroundColor !== "default") {
        // Variable tokens were inserted with a blue background — keep them tinted.
        css.push(`background-color:${styles.backgroundColor === "blue" ? "#ede9fe" : styles.backgroundColor}`);
        css.push("padding:0 2px;border-radius:3px");
      }
      if (css.length) html = `<span style="${css.join(";")}">${html}</span>`;

      return html;
    })
    .join("");
}

function alignStyle(props: Record<string, unknown> | undefined): string {
  const a = props?.textAlignment;
  return a && a !== "left" ? ` style="text-align:${a}"` : "";
}

// ─── Scenario pricing table ─────────────────────────────────────────────────────

function calcTotals(s: SerializeScenario, taxRate: number) {
  const monthly = s.line_items.filter(i => i.billing_period === "Monthly")
    .reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
  const onetime = s.line_items.filter(i => i.billing_period === "One Time")
    .reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
  const taxable = s.line_items.filter(i => i.is_taxable)
    .reduce((sum, i) => sum + i.quantity * (i.unit_price ?? 0), 0);
  const tax = taxable * taxRate;
  return { monthly, onetime, tax, total: monthly + onetime + tax };
}

function renderScenarioTable(s: SerializeScenario, taxRate: number): string {
  const t = calcTotals(s, taxRate);
  const rows = s.line_items.map((i) => `
    <tr>
      <td class="desc">${escapeHtml(i.description)}</td>
      <td class="bill">${i.billing_period ?? "—"}</td>
      <td class="num">${Math.round(i.quantity)}</td>
      <td class="num">${fmtCurrency(i.unit_price)}</td>
      <td class="num">${fmtCurrency(i.quantity * (i.unit_price ?? 0))}</td>
    </tr>`).join("");

  return `
  <table class="scenario-table">
    <thead>
      <tr>
        <th class="scenario-title" colspan="5">
          ${escapeHtml(s.name)}${s.is_recommended ? ' <span class="rec-badge">Recommended</span>' : ""}
        </th>
      </tr>
      <tr class="col-head">
        <th>Description</th><th>Billing</th><th>Qty</th><th>Unit Price</th><th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="5" class="empty">No line items</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan="4">Monthly Recurring</td><td class="num">${fmtCurrency(t.monthly)}</td></tr>
      <tr><td colspan="4">One-Time</td><td class="num">${fmtCurrency(t.onetime)}</td></tr>
      ${taxRate > 0 ? `<tr><td colspan="4">Tax (${(taxRate * 100).toFixed(2)}%)</td><td class="num">${fmtCurrency(t.tax)}</td></tr>` : ""}
      <tr class="grand"><td colspan="4">Total</td><td class="num">${fmtCurrency(t.total)}</td></tr>
    </tfoot>
  </table>`;
}

function resolveScenarioRef(ref: string | undefined, scenarios: SerializeScenario[]): SerializeScenario[] {
  const sorted = [...scenarios].sort((a, b) => a.sort_order - b.sort_order);
  if (!ref || ref === "all") return sorted;
  if (ref === "recommended") {
    const rec = sorted.find(s => s.is_recommended);
    return rec ? [rec] : sorted;
  }
  const byId = sorted.find(s => s.id === ref);
  return byId ? [byId] : [];
}

// ─── Block rendering ───────────────────────────────────────────────────────────

function renderBlocks(input: SerializeInput, tokenMap: Record<string, string>): string {
  const { blocks, scenarios, quote, imageUrlMap = {} } = input;
  const taxRate = quote.tax_rate ?? 0;
  const out: string[] = [];

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const props = block.props ?? {};

    switch (block.type) {
      case "heading": {
        const level = Math.min(Math.max(Number(props.level) || 1, 1), 3);
        out.push(`<h${level}${alignStyle(props)}>${renderInline(block.content, tokenMap)}</h${level}>`);
        i++;
        break;
      }

      case "bulletListItem":
      case "numberedListItem": {
        // Group consecutive list items of the same type into one list.
        const tag = block.type === "bulletListItem" ? "ul" : "ol";
        const items: string[] = [];
        while (i < blocks.length && blocks[i].type === block.type) {
          items.push(`<li>${renderInline(blocks[i].content, tokenMap)}</li>`);
          i++;
        }
        out.push(`<${tag}>${items.join("")}</${tag}>`);
        break;
      }

      case "image": {
        const rawUrl: string = props.url ?? "";
        const url = imageUrlMap[rawUrl] ?? rawUrl;
        const width = props.previewWidth ? ` width="${Number(props.previewWidth)}"` : "";
        const align = props.textAlignment && props.textAlignment !== "left" ? props.textAlignment : "left";
        const caption = props.caption
          ? `<figcaption>${escapeHtml(substituteTokens(props.caption, tokenMap))}</figcaption>`
          : "";
        out.push(
          `<figure style="text-align:${align}"><img src="${escapeHtml(url)}"${width} />${caption}</figure>`
        );
        i++;
        break;
      }

      case "pageBreak": {
        out.push(`<div class="page-break"></div>`);
        i++;
        break;
      }

      case "scenarioTable": {
        const targets = resolveScenarioRef(props.scenarioRef, scenarios);
        out.push(`<div class="scenario-block">${targets.map(s => renderScenarioTable(s, taxRate)).join("")}</div>`);
        i++;
        break;
      }

      case "paragraph":
      default: {
        const inner = renderInline(block.content, tokenMap);
        out.push(`<p${alignStyle(props)}>${inner || "&nbsp;"}</p>`);
        i++;
        break;
      }
    }
  }

  return out.join("\n");
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Renders just the document body HTML (no <html>/<head>). */
export function buildDocumentBody(input: SerializeInput): string {
  const tokenMap = buildTokenMap(input);
  let body = renderBlocks(input, tokenMap);

  // Safety net: if the document placed no scenario tables, append all scenarios
  // at the end so a quote never goes out without pricing.
  const hasScenarioBlock = input.blocks.some(b => b.type === "scenarioTable");
  if (!hasScenarioBlock && input.scenarios.length > 0) {
    const taxRate = input.quote.tax_rate ?? 0;
    const sorted = [...input.scenarios].sort((a, b) => a.sort_order - b.sort_order);
    body += `\n<div class="scenario-block auto-appended"><h2>Pricing</h2>${sorted.map(s => renderScenarioTable(s, taxRate)).join("")}</div>`;
  }

  return body;
}

/** Renders a complete, print-ready HTML page. */
export function buildFullHtml(input: SerializeInput): string {
  const body = buildDocumentBody(input);
  const { quote, client } = input;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(quote.title || quote.quote_number || "Proposal")}</title>
<style>
  @page { size: Letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b; font-size: 12pt; line-height: 1.6; margin: 0;
  }
  /* The @page margin applies to the printed PDF. For the on-screen Preview
     (iframe) there is no @page margin, so pad the body to match — also caps the
     content width so long lines stay readable, like a real page. */
  @media screen {
    html { background: #e2e8f0; }
    body {
      padding: 0.75in; width: 8.5in; max-width: 100%; min-height: 11in;
      margin: 24px auto; background: #fff;
      border: 1px solid #cbd5e1; border-radius: 2px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
  }
  h1 { font-size: 22pt; margin: 0 0 8px; }
  h2 { font-size: 16pt; margin: 18px 0 6px; }
  h3 { font-size: 13pt; margin: 14px 0 4px; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 0 0 8px 1.2em; padding: 0; }
  li { margin: 0 0 4px; }
  a { color: #6d28d9; }
  figure { margin: 12px 0; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  figcaption { font-size: 9pt; color: #64748b; margin-top: 4px; }

  .doc-header {
    border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px;
    display: flex; justify-content: space-between; align-items: flex-start;
  }
  .doc-header .meta { text-align: right; font-size: 10pt; color: #64748b; }
  .doc-header .quote-number { font-family: monospace; font-size: 11pt; color: #475569; }

  .page-break { page-break-after: always; height: 0; }
  /* On screen there are no real pages, so show a visible marker where the
     break falls. Spans to the page edges (cancels the body's 0.75in padding). */
  @media screen {
    .page-break {
      height: 0; margin: 30px -0.75in;
      border-top: 2px dashed #94a3b8; position: relative;
    }
    .page-break::after {
      content: "Page Break"; position: absolute; top: -9px; left: 50%;
      transform: translateX(-50%);
      background: #e2e8f0; color: #64748b; font-size: 9pt;
      padding: 0 10px; letter-spacing: 0.05em;
    }
  }

  .scenario-block { margin: 16px 0; }
  .scenario-table {
    width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 10.5pt;
    page-break-inside: avoid;
  }
  .scenario-table .scenario-title {
    text-align: left; background: #f5f3ff; color: #5b21b6; font-size: 12pt;
    padding: 8px 10px; border: 1px solid #ddd6fe;
  }
  .rec-badge {
    font-size: 8pt; background: #ddd6fe; color: #5b21b6; padding: 2px 6px;
    border-radius: 9999px; vertical-align: middle; margin-left: 6px;
  }
  .scenario-table .col-head th {
    text-align: left; background: #faf5ff; color: #6b7280; font-weight: 600;
    padding: 6px 10px; border: 1px solid #ede9fe; font-size: 9.5pt;
  }
  .scenario-table td { padding: 6px 10px; border: 1px solid #f1f5f9; }
  .scenario-table td.num, .scenario-table th.num,
  .scenario-table .col-head th:nth-child(n+3) { text-align: right; }
  .scenario-table tfoot td { background: #faf5ff; color: #5b21b6; font-weight: 600; }
  .scenario-table tfoot .grand td { border-top: 2px solid #c4b5fd; font-weight: 700; }
  .scenario-table .empty { text-align: center; color: #94a3b8; }
</style>
</head>
<body>
  <div class="doc-header">
    <div>
      <h1 style="font-size:16pt;margin:0">${escapeHtml(client.company_name || "")}</h1>
      <div class="quote-number">${escapeHtml(quote.quote_number || "")}</div>
    </div>
    <div class="meta">
      ${quote.title ? `<div><strong>${escapeHtml(quote.title)}</strong></div>` : ""}
      ${quote.valid_until ? `<div>Valid until: ${fmtDate(quote.valid_until)}</div>` : ""}
      ${quote.payment_terms ? `<div>Terms: ${escapeHtml(quote.payment_terms)}</div>` : ""}
    </div>
  </div>
  ${body}
</body>
</html>`;
}
