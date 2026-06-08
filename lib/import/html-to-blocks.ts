// Converts (mammoth-produced) HTML into BlockNote blocks.
//
// We do this ourselves instead of using editor.tryParseHTMLToBlocks because
// BlockNote 0.14's HTML parser mishandles <table> — it emits an empty table
// shell and dumps cell content into `children`. Here we build proper
// `tableContent` rows/cells, plus headings, paragraphs, lists, links, and images.
//
// Runs in the browser (uses DOMParser).

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Styles { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean }

function inlineFrom(node: Node, styles: Styles, out: any[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text) out.push({ type: "text", text, styles: { ...styles } });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const next: Styles = { ...styles };
  if (tag === "strong" || tag === "b") next.bold = true;
  if (tag === "em" || tag === "i") next.italic = true;
  if (tag === "u") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;

  if (tag === "br") { out.push({ type: "text", text: "\n", styles: { ...styles } }); return; }

  if (tag === "a") {
    const href = el.getAttribute("href") || "";
    const inner: any[] = [];
    el.childNodes.forEach((c) => inlineFrom(c, next, inner));
    const textRuns = inner.filter((c) => c.type === "text");
    if (href && textRuns.length) { out.push({ type: "link", href, content: textRuns }); return; }
    el.childNodes.forEach((c) => inlineFrom(c, next, out));
    return;
  }

  el.childNodes.forEach((c) => inlineFrom(c, next, out));
}

function inlineContent(el: Element): any[] {
  const out: any[] = [];
  el.childNodes.forEach((c) => inlineFrom(c, {}, out));
  return out;
}

function buildTable(table: Element): any | null {
  const rows: any[] = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells: any[] = [];
    tr.querySelectorAll("th,td").forEach((cell) => {
      cells.push(inlineContent(cell as Element));
    });
    if (cells.length) rows.push({ cells });
  });
  if (!rows.length) return null;
  // Normalize ragged rows to a uniform column count (BlockNote expects this).
  const maxCols = Math.max(...rows.map((r) => r.cells.length));
  rows.forEach((r) => { while (r.cells.length < maxCols) r.cells.push([]); });
  return { type: "table", props: {}, content: { type: "tableContent", rows } };
}

function blockFromElement(el: Element): any | any[] | null {
  const tag = el.tagName.toLowerCase();

  // Skip non-content elements that can appear in a full HTML file.
  if (tag === "script" || tag === "style" || tag === "noscript" || tag === "head") return null;

  if (/^h[1-6]$/.test(tag)) {
    const level = Math.min(parseInt(tag[1], 10), 3);
    return { type: "heading", props: { level }, content: inlineContent(el) };
  }
  if (tag === "p") {
    return { type: "paragraph", content: inlineContent(el) };
  }
  if (tag === "ul" || tag === "ol") {
    const type = tag === "ul" ? "bulletListItem" : "numberedListItem";
    return Array.from(el.querySelectorAll(":scope > li")).map((li) => ({
      type, content: inlineContent(li as Element),
    }));
  }
  if (tag === "table") return buildTable(el);
  if (tag === "img") {
    const src = el.getAttribute("src");
    return src ? { type: "image", props: { url: src } } : null;
  }
  if (tag === "figure") {
    const img = el.querySelector("img");
    const src = img?.getAttribute("src");
    return src ? { type: "image", props: { url: src } } : null;
  }
  if (tag === "blockquote" || tag === "div" || tag === "section") {
    // Unwrap containers: convert their block children recursively.
    const inner: any[] = [];
    Array.from(el.children).forEach((child) => {
      const b = blockFromElement(child);
      if (Array.isArray(b)) inner.push(...b);
      else if (b) inner.push(b);
    });
    if (inner.length) return inner;
  }
  const content = inlineContent(el);
  return content.length ? { type: "paragraph", content } : null;
}

export function htmlToBlocks(html: string): any[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: any[] = [];
  Array.from(doc.body.children).forEach((el) => {
    const b = blockFromElement(el);
    if (Array.isArray(b)) blocks.push(...b);
    else if (b) blocks.push(b);
  });
  return blocks.length ? blocks : [{ type: "paragraph" }];
}
