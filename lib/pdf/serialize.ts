import type {
  SerializeInput,
  SerializeScenario,
  DocBlock,
  InlineContent,
} from "./types";
import { scenarioColor, type ScenarioColor } from "../scenario-colors";

// ─── Helpers ────────────────────────────────────────────────────────────────

function nl2br(s: string): string {
  return s.replace(/\r\n|\r|\n/g, "<br>");
}

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
  if (typeof content === "string") return nl2br(escapeHtml(substituteTokens(content, tokenMap)));

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
      // Soft line breaks (Shift+Enter) come through as "\n" in the text; HTML
      // collapses literal newlines to a space, so convert them to <br> or the
      // lines merge onto one — most visible inside table cells.
      let html = nl2br(escapeHtml(substituteTokens(raw, tokenMap)));
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

// Revenue after the line's discount (percent and/or fixed amount, floored at 0).
// Exported for unit testing (lib/pdf/serialize.test.ts).
export function lineRev(i: { quantity: number; unit_price: number | null; discount_percent?: number | null; discount_amount?: number | null }) {
  const gross = i.quantity * (i.unit_price ?? 0);
  return Math.max(gross * (1 - (i.discount_percent ?? 0) / 100) - (i.discount_amount ?? 0), 0);
}

// One-time setup fee for a line (per-unit), regardless of billing period.
export function lineSetup(i: { quantity: number; setup_price?: number | null }) {
  return i.quantity * (i.setup_price ?? 0);
}

export function calcTotals(s: SerializeScenario, taxRate: number) {
  const monthly = s.line_items.filter(i => i.billing_period === "Monthly").reduce((sum, i) => sum + lineRev(i), 0);
  const setup = s.line_items.reduce((sum, i) => sum + lineSetup(i), 0);
  // Setup fees are one-time → fold into the one-time total.
  const onetime = s.line_items.filter(i => i.billing_period === "One Time").reduce((sum, i) => sum + lineRev(i), 0) + setup;
  const taxable = s.line_items.filter(i => i.is_taxable).reduce((sum, i) => sum + lineRev(i) + lineSetup(i), 0);
  const tax = taxable * taxRate;
  const savings = s.line_items.reduce(
    (sum, i) => sum + (i.quantity * (i.unit_price ?? 0) - lineRev(i)), 0);
  return { monthly, onetime, setup, tax, total: monthly + onetime + tax, savings };
}

function renderScenarioTable(s: SerializeScenario, taxRate: number, c: ScenarioColor): string {
  const t = calcTotals(s, taxRate);
  // Show the Discount column only when a discount exists in this scenario.
  const hasDisc = s.line_items.some(i => (i.discount_percent ?? 0) > 0 || (i.discount_amount ?? 0) > 0);
  const colCount = hasDisc ? 6 : 5;
  const labelSpan = hasDisc ? 5 : 4;
  const rows = s.line_items.map((i) => `
    <tr>
      <td class="desc">${escapeHtml(i.description)}${lineSetup(i) > 0 ? `<span class="setup-note">+ ${fmtCurrency(lineSetup(i))} setup (one-time)</span>` : ""}</td>
      <td class="bill">${i.billing_period ?? "—"}</td>
      <td class="num">${Math.round(i.quantity)}</td>
      <td class="num">${fmtCurrency(i.unit_price)}</td>
      ${hasDisc ? `<td class="num">${(i.discount_percent ?? 0) > 0 ? `−${i.discount_percent}%` : (i.discount_amount ?? 0) > 0 ? `−${fmtCurrency(i.discount_amount)}` : "—"}</td>` : ""}
      <td class="num">${fmtCurrency(lineRev(i))}</td>
    </tr>`).join("");

  const headStyle = `background:${c.headBg};color:${c.headText};border:1px solid ${c.border}`;
  const colHeadStyle = `background:${c.footBg};border:1px solid ${c.border}`;
  const footStyle = `background:${c.footBg};color:${c.footText}`;
  const badgeStyle = `background:${c.border};color:${c.headText}`;

  return `
  <table class="scenario-table" style="border:1px solid ${c.border}">
    <thead>
      <tr>
        <th class="scenario-title" colspan="${colCount}" style="${headStyle}">
          ${escapeHtml(s.name)}${s.is_recommended ? ` <span class="rec-badge" style="${badgeStyle}">Recommended</span>` : ""}
        </th>
      </tr>
      <tr class="col-head">
        <th style="${colHeadStyle}">Description</th><th style="${colHeadStyle}">Billing</th><th style="${colHeadStyle}">Qty</th><th style="${colHeadStyle}">Unit Price</th>${hasDisc ? `<th style="${colHeadStyle}">Discount</th>` : ""}<th style="${colHeadStyle}">Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${colCount}" class="empty">No line items</td></tr>`}
    </tbody>
    <tfoot>
      <tr><td colspan="${labelSpan}" style="${footStyle}">Monthly Recurring</td><td class="num" style="${footStyle}">${fmtCurrency(t.monthly)}</td></tr>
      <tr><td colspan="${labelSpan}" style="${footStyle}">One-Time${t.setup > 0 ? ` <span class="setup-incl">(incl. ${fmtCurrency(t.setup)} setup)</span>` : ""}</td><td class="num" style="${footStyle}">${fmtCurrency(t.onetime)}</td></tr>
      ${taxRate > 0 ? `<tr><td colspan="${labelSpan}" style="${footStyle}">Tax (${(taxRate * 100).toFixed(2)}%)</td><td class="num" style="${footStyle}">${fmtCurrency(t.tax)}</td></tr>` : ""}
      <tr class="grand"><td colspan="${labelSpan}" style="${footStyle};border-top:2px solid ${c.accent}">Total</td><td class="num" style="${footStyle};border-top:2px solid ${c.accent}">${fmtCurrency(t.total)}</td></tr>
      ${t.savings > 0 ? `<tr><td colspan="${labelSpan}" class="savings">You save</td><td class="num savings">${fmtCurrency(t.savings)}</td></tr>` : ""}
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
  // Stable color index per scenario id, by sort position (matches the editor).
  const colorIndex: Record<string, number> = {};
  [...scenarios].sort((a, b) => a.sort_order - b.sort_order).forEach((s, i) => { colorIndex[s.id] = i; });

  // Radio-field names become the title DocuSeal shows the signer, so derive a
  // human-readable name from the question (e.g. "Data Backup Options") instead
  // of a cryptic "Choice-<uuid>". Names must be unique across the document, so
  // duplicates get a " (2)" suffix; an unlabelled question falls back to "Choice N".
  const usedRadioNames = new Map<string, number>();
  let radioSeq = 0;
  function radioFieldName(label: string): string {
    radioSeq++;
    // Strip a trailing colon and collapse whitespace; cap length for tidy titles.
    let base = label.replace(/\s+/g, " ").trim().replace(/:$/, "").trim();
    if (base.length > 60) base = base.slice(0, 60).trim();
    if (!base) base = `Choice ${radioSeq}`;
    const seen = usedRadioNames.get(base) ?? 0;
    usedRadioNames.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  }
  // Renders a block array; recurses into each block's children so NESTED content
  // (e.g. a table nested under a paragraph) is not dropped.
  function renderChildren(b: DocBlock): string {
    return Array.isArray(b.children) && b.children.length ? renderArray(b.children) : "";
  }
  function renderArray(blocks: DocBlock[]): string {
  const out: string[] = [];

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const props = block.props ?? {};

    switch (block.type) {
      case "heading": {
        const level = Math.min(Math.max(Number(props.level) || 1, 1), 3);
        out.push(`<h${level}${alignStyle(props)}>${renderInline(block.content, tokenMap)}</h${level}>`);
        out.push(renderChildren(block));
        i++;
        break;
      }

      case "bulletListItem":
      case "numberedListItem": {
        // Group consecutive list items of the same type into one list.
        const tag = block.type === "bulletListItem" ? "ul" : "ol";
        const items: string[] = [];
        while (i < blocks.length && blocks[i].type === block.type) {
          items.push(`<li>${renderInline(blocks[i].content, tokenMap)}${renderChildren(blocks[i])}</li>`);
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
        out.push(renderChildren(block));
        i++;
        break;
      }

      case "pageBreak": {
        out.push(`<div class="page-break"></div>`);
        i++;
        break;
      }

      case "signatureField": {
        const signer = props.signer === "tenant" ? "tenant" : "client";
        if (input.forSigning) {
          // DocuSeal HTML element field tags ({{...}} text tags are PDF-only).
          const role = signer === "tenant" ? "Company" : "Client";
          out.push(
            `<div class="sig-field">` +
            `<signature-field name="${role} Signature" role="${role}" style="width:260px;height:70px;display:inline-block"></signature-field>` +
            `<div class="sig-meta">` +
            `<text-field name="${role} Name" role="${role}" style="width:180px;height:18px;display:inline-block"></text-field>` +
            `&nbsp;·&nbsp;` +
            `<date-field name="${role} Date" role="${role}" style="width:120px;height:18px;display:inline-block"></date-field>` +
            `</div></div>`
          );
        } else {
          const label = signer === "tenant"
            ? escapeHtml(input.tenant.name || "Authorized signature")
            : escapeHtml(input.client.company_name || "Client");
          out.push(
            `<div class="sig-line"><div class="sig-rule"></div>` +
            `<div class="sig-label">${label} — Signature &nbsp;·&nbsp; Date</div></div>`
          );
        }
        i++;
        break;
      }

      case "initialsField": {
        const signer = props.signer === "tenant" ? "tenant" : "client";
        const role = signer === "tenant" ? "Company" : "Client";
        if (input.forSigning) {
          out.push(
            `<div class="initials-field">` +
            `<initials-field name="${role} Initials-${block.id ?? i}" role="${role}" style="width:90px;height:44px;display:inline-block"></initials-field>` +
            `<div class="initials-label">${role} initials</div></div>`
          );
        } else {
          out.push(
            `<div class="initials-line"><div class="initials-box"></div>` +
            `<div class="initials-label">${role} initials</div></div>`
          );
        }
        i++;
        break;
      }

      case "radioField": {
        const signer = props.signer === "tenant" ? "tenant" : "client";
        const role = signer === "tenant" ? "Company" : "Client";
        const rawLabel = substituteTokens(String(props.label ?? ""), tokenMap);
        const question = escapeHtml(rawLabel);
        const opts = String(props.options ?? "").split(",").map(o => o.trim()).filter(Boolean);
        if (input.forSigning) {
          // Field name = the title DocuSeal shows the signer; make it meaningful.
          const fieldName = radioFieldName(rawLabel);
          out.push(
            `<div class="radio-field">` +
            (question ? `<div class="radio-q">${question}</div>` : "") +
            `<radio-field name="${escapeHtml(fieldName)}" role="${role}" required="true" options="${escapeHtml(opts.join(","))}"></radio-field>` +
            `</div>`
          );
        } else {
          const optsHtml = opts.map(o => `<div class="radio-opt"><span class="radio-dot">&#9711;</span> ${escapeHtml(o)}</div>`).join("");
          out.push(
            `<div class="radio-field">` +
            (question ? `<div class="radio-q">${question}</div>` : "") +
            optsHtml +
            `</div>`
          );
        }
        i++;
        break;
      }

      case "acceptanceField": {
        // A statement the CUSTOMER must accept. Role is always Client.
        const label = escapeHtml(substituteTokens(String(props.label ?? ""), tokenMap));
        if (input.forSigning) {
          // Required DocuSeal checkbox — the client can't complete without it.
          const fieldName = `Acceptance-${block.id ?? i}`;
          out.push(
            `<div class="accept-field">` +
            `<checkbox-field name="${escapeHtml(fieldName)}" role="Client" required="true" style="width:16px;height:16px;display:inline-block;vertical-align:top"></checkbox-field>` +
            `<span class="accept-text">${label}</span>` +
            `</div>`
          );
        } else {
          out.push(
            `<div class="accept-field"><span class="accept-box">&#9744;</span><span class="accept-text">${label}</span></div>`
          );
        }
        i++;
        break;
      }

      case "table": {
        // BlockNote table content: { type:"tableContent", rows:[{ cells: InlineContent[][] }] }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = (block.content as any)?.rows ?? [];
        const rowsHtml = rows.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cells = (r.cells ?? []).map((cell: any) => `<td>${renderInline(cell, tokenMap)}</td>`).join("");
          return `<tr>${cells}</tr>`;
        }).join("");
        if (rowsHtml) out.push(`<table class="doc-table">${rowsHtml}</table>`);
        out.push(renderChildren(block));
        i++;
        break;
      }

      case "scenarioTable": {
        const targets = resolveScenarioRef(props.scenarioRef, scenarios);
        out.push(`<div class="scenario-block">${targets.map(s => renderScenarioTable(s, taxRate, scenarioColor(colorIndex[s.id] ?? 0))).join("")}</div>`);
        i++;
        break;
      }

      case "paragraph":
      default: {
        const inner = renderInline(block.content, tokenMap);
        out.push(`<p${alignStyle(props)}>${inner || "&nbsp;"}</p>`);
        out.push(renderChildren(block));
        i++;
        break;
      }
    }
  }

  return out.join("\n");
  }

  return renderArray(blocks);
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Renders just the document body HTML (no <html>/<head>).
 * Pricing is OPTIONAL: tables appear only where the author placed a
 * `scenarioTable` block (`/pricing`). Nothing is auto-appended — if the document
 * has no pricing table, the output simply contains none. The UI warns the user
 * about this before generating a preview/PDF.
 */
export function buildDocumentBody(input: SerializeInput): string {
  const tokenMap = buildTokenMap(input);
  let body = renderBlocks(input, tokenMap);

  // Logo tokens render as inline images (not text). They survive HTML escaping
  // intact (no special chars), so a final substitution on the body is safe.
  const map = input.imageUrlMap ?? {};
  const clientLogo = input.client.logo_url ? (map[input.client.logo_url] ?? input.client.logo_url) : "";
  const tenantLogo = input.tenant.logo_url ? (map[input.tenant.logo_url] ?? input.tenant.logo_url) : "";
  const img = (src: string) => src ? `<img class="inline-logo" src="${escapeHtml(src)}" alt="" />` : "";
  body = body
    .replace(/\{\{client\.logo\}\}/g, img(clientLogo))
    .replace(/\{\{tenant\.logo\}\}/g, img(tenantLogo));

  return body;
}

// Header/footer are stamped onto pages 2+ by the pdf-service using pdf-lib
// (so numbering can start at 1 on the second physical page). The data it needs:
export interface HeaderFooterMeta {
  tenantName: string;
  quoteNumber: string;
  clientCompany: string;
}
export function buildHeaderFooterMeta(input: SerializeInput): HeaderFooterMeta {
  return {
    tenantName:    input.tenant.name || "",
    quoteNumber:   input.quote.quote_number || "",
    clientCompany: input.client.company_name || "",
  };
}

/** Renders a complete, print-ready HTML page. */
/** HTML for the e-signature copy: same as the PDF, but signature-field blocks
 *  emit DocuSeal field tags. Sent to DocuSeal's /submissions/html. */
export function buildSigningHtml(input: SerializeInput): string {
  return buildFullHtml({ ...input, forSigning: true });
}

export function buildFullHtml(input: SerializeInput): string {
  const body = buildDocumentBody(input);
  const { quote, client, tenant, imageUrlMap = {} } = input;

  // Tenant logo on the first page (resolved sb-storage:// → signed URL).
  const logoSrc = tenant.logo_url ? (imageUrlMap[tenant.logo_url] ?? tenant.logo_url) : "";
  const logoHtml = logoSrc
    ? `<div class="doc-logo"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(tenant.name || "")}" /></div>`
    : "";

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
  .doc-logo { margin-bottom: 16px; }
  .doc-logo img { max-height: 72px; max-width: 260px; object-fit: contain; }
  .inline-logo { max-height: 80px; max-width: 240px; vertical-align: middle; object-fit: contain; }

  /* Signature blocks */
  .sig-line { margin: 28px 0 8px; max-width: 320px; }
  .sig-rule { border-bottom: 1px solid #475569; height: 28px; }
  .sig-label { font-size: 9.5pt; color: #64748b; margin-top: 4px; }
  .sig-field { margin: 24px 0 8px; }

  /* Initials */
  .initials-line, .initials-field { display: inline-block; margin: 16px 16px 8px 0; vertical-align: top; }
  .initials-box { border: 1px solid #475569; width: 90px; height: 44px; border-radius: 4px; }
  .initials-label { font-size: 9pt; color: #64748b; margin-top: 4px; }

  /* Multiple choice (radio) */
  .radio-field { margin: 14px 0; font-size: 10.5pt; }
  .radio-field .radio-q { font-weight: 600; margin-bottom: 4px; }
  .radio-field .radio-opt { margin: 2px 0; }
  .radio-field .radio-dot { color: #475569; }
  .sig-meta { font-size: 9.5pt; color: #64748b; margin-top: 6px; }

  /* Acceptance checkbox (customer must accept before signing) */
  .accept-field { margin: 12px 0; display: flex; align-items: flex-start; gap: 8px; font-size: 10.5pt; }
  .accept-field .accept-box { font-size: 13pt; line-height: 1; }
  .accept-field .accept-text { flex: 1; }

  /* Imported (Word) tables */
  .doc-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10.5pt; page-break-inside: avoid; }
  .doc-table td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }

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
  .scenario-table .savings { background: #f0fdf4 !important; color: #16a34a !important; font-weight: 700; }
  .scenario-table .desc .setup-note { display: block; font-size: 11px; color: #64748b; margin-top: 2px; }
  .scenario-table tfoot .setup-incl { font-weight: 400; opacity: 0.75; }
</style>
</head>
<body>
  ${logoHtml}
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
