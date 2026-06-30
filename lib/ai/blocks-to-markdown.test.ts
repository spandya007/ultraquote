import { describe, it, expect } from "vitest";
import { blocksToMarkdown } from "./blocks-to-markdown";
import type { DocBlock } from "@/lib/pdf/types";

const text = (t: string) => [{ type: "text", text: t }];

describe("blocksToMarkdown", () => {
  it("renders headings at their level", () => {
    const blocks: DocBlock[] = [
      { type: "heading", props: { level: 1 }, content: text("Overview") },
      { type: "heading", props: { level: 2 }, content: text("Scope") },
    ];
    expect(blocksToMarkdown(blocks)).toBe("# Overview\n\n## Scope");
  });

  it("renders paragraphs, lists, and quotes", () => {
    const blocks: DocBlock[] = [
      { type: "paragraph", content: text("Intro line.") },
      { type: "bulletListItem", content: text("First") },
      { type: "numberedListItem", content: text("Second") },
      { type: "checkListItem", props: { checked: true }, content: text("Done") },
      { type: "quote", content: text("A quote") },
    ];
    expect(blocksToMarkdown(blocks)).toBe(
      "Intro line.\n\n- First\n\n1. Second\n\n- [x] Done\n\n> A quote"
    );
  });

  it("renders links inline", () => {
    const blocks: DocBlock[] = [
      { type: "paragraph", content: [{ type: "link", href: "https://x.test", content: text("here") }] },
    ];
    expect(blocksToMarkdown(blocks)).toBe("[here](https://x.test)");
  });

  it("renders a table as a Markdown table", () => {
    const blocks: DocBlock[] = [
      {
        type: "table",
        content: { rows: [{ cells: [text("A"), text("B")] }, { cells: [text("1"), text("2")] }] } as never,
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("replaces non-narrative blocks with placeholders and drops images", () => {
    const blocks: DocBlock[] = [
      { type: "scenarioTable", props: { scenarioRef: "recommended" } },
      { type: "signatureField", props: { signer: "client" } },
      { type: "image", props: { url: "sb-storage://x" } },
      { type: "paragraph", content: text("After") },
    ];
    expect(blocksToMarkdown(blocks)).toBe("_[pricing table]_\n\n_[signature]_\n\nAfter");
  });

  it("recurses into children", () => {
    const blocks: DocBlock[] = [
      { type: "paragraph", content: text("Parent"), children: [{ type: "paragraph", content: text("Child") }] },
    ];
    expect(blocksToMarkdown(blocks)).toBe("Parent\n\nChild");
  });

  it("returns empty string for non-array input", () => {
    expect(blocksToMarkdown(undefined)).toBe("");
    expect(blocksToMarkdown(null)).toBe("");
  });
});
