import { describe, it, expect } from "vitest";
import { stripMarkdownTables } from "./strip-markdown-tables";

describe("stripMarkdownTables", () => {
  it("converts a GFM table to a bullet list and removes all pipe rows", () => {
    const md = `## Investment

| Phase | Duration | Owner |
| --- | --- | --- |
| Discovery | 2 weeks | Us |
| Rollout | 4 weeks | Joint |

We look forward to it.`;
    const out = stripMarkdownTables(md);
    expect(out).toContain("- Phase — Duration — Owner");
    expect(out).toContain("- Discovery — 2 weeks — Us");
    expect(out).toContain("We look forward to it.");
    // No pipe-table syntax survives (would crash BlockNote's table parser).
    expect(out).not.toMatch(/^\s*\|/m);
    expect(out).not.toContain("---");
  });

  it("leaves table-free Markdown untouched (idempotent)", () => {
    const md = "## Scope\n\nWe will deliver:\n\n- Onboarding\n- Monitoring";
    expect(stripMarkdownTables(md)).toBe(md);
    expect(stripMarkdownTables(stripMarkdownTables(md))).toBe(md);
  });

  it("handles a table without a separator row", () => {
    const md = "| a | b |\n| c | d |";
    expect(stripMarkdownTables(md)).toBe("- a — b\n- c — d");
  });

  it("handles empty/undefined input", () => {
    expect(stripMarkdownTables("")).toBe("");
  });
});
