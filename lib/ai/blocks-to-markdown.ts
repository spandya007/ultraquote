import type { DocBlock, InlineContent } from "@/lib/pdf/types";

// Serializes BlockNote document blocks to compact Markdown for use as LLM prompt
// context (a template skeleton or a past-proposal exemplar). This is NOT the
// print serializer (lib/pdf/serialize.ts → HTML); it deliberately strips styling,
// images, and signature/pricing blocks, keeping only the narrative structure
// (headings, paragraphs, lists, quotes, tables) the model should learn from.

function inlineToText(content: DocBlock["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return ""; // e.g. a table block's { rows } object
  return content
    .map((c) => {
      if (c.type === "link") {
        // Links carry their own nested inline content + href.
        const inner = Array.isArray(c.content)
          ? inlineToText(c.content as InlineContent[])
          : c.text ?? "";
        return c.href ? `[${inner}](${c.href})` : inner;
      }
      return c.text ?? "";
    })
    .join("");
}

// BlockNote 0.14 table content: { type: "tableContent", rows: [{ cells: Inline[][] }] }.
function tableToMarkdown(content: DocBlock["content"]): string {
  const rows = (content as { rows?: { cells?: (InlineContent[] | string)[] }[] } | undefined)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const render = (cells?: (InlineContent[] | string)[]) =>
    "| " + (cells ?? []).map((cell) => inlineToText(cell).replace(/\n/g, " ").trim()).join(" | ") + " |";
  const lines = [render(rows[0].cells)];
  const colCount = rows[0].cells?.length ?? 0;
  lines.push("| " + Array(colCount).fill("---").join(" | ") + " |");
  for (let i = 1; i < rows.length; i++) lines.push(render(rows[i].cells));
  return lines.join("\n");
}

function blockToMarkdown(block: DocBlock): string {
  const text = inlineToText(block.content);
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(block.props?.level) || 1, 1), 3);
      return `${"#".repeat(level)} ${text}`;
    }
    case "bulletListItem":
      return `- ${text}`;
    case "numberedListItem":
      return `1. ${text}`;
    case "checkListItem":
      return `- [${block.props?.checked ? "x" : " "}] ${text}`;
    case "quote":
      return `> ${text}`;
    case "table":
      return tableToMarkdown(block.content);
    case "pageBreak":
      return "---";
    // Non-narrative blocks: keep a placeholder so structure/position is legible
    // but the model never tries to reproduce live pricing or a signature.
    case "scenarioTable":
      return "_[pricing table]_";
    case "signatureField":
      return "_[signature]_";
    case "image":
      return ""; // images aren't useful as text context
    default:
      return text;
  }
}

/** BlockNote document blocks → Markdown. Recurses children (nested content). */
export function blocksToMarkdown(blocks: DocBlock[] | undefined | null): string {
  if (!Array.isArray(blocks)) return "";
  const out: string[] = [];
  for (const block of blocks) {
    const md = blockToMarkdown(block);
    if (md) out.push(md);
    if (Array.isArray(block.children) && block.children.length) {
      const childMd = blocksToMarkdown(block.children);
      if (childMd) out.push(childMd);
    }
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
