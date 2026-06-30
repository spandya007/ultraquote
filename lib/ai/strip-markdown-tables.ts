// Converts any GFM Markdown table to a bullet list. BlockNote 0.14's markdown
// parser mangles tables into a malformed `table` block (empty content + rows
// dumped into children) that crashes the table extension's mouse handler
// ("Cannot read properties of undefined (reading 'rows')"). AI-drafted proposal
// narrative should not contain tables anyway (pricing lives in the dedicated
// pricing-table block), so we strip them at the source — on BOTH the server
// (/api/ai/draft) and the client (before tryParseMarkdownToBlocks), so it works
// regardless of which side recompiled. Idempotent.

const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");

export function stripMarkdownTables(md: string): string {
  if (!md) return md;
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isRow(lines[i])) {
      // Consume the contiguous table block; emit each non-separator row as a
      // bullet with cells joined by an em dash.
      while (i < lines.length && (isRow(lines[i]) || isSep(lines[i]))) {
        if (!isSep(lines[i])) {
          const cells = lines[i]
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean);
          if (cells.length) out.push("- " + cells.join(" — "));
        }
        i++;
      }
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join("\n");
}
