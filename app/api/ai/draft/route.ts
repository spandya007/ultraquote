import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/access/guard";
import { loadSerializeInput } from "@/lib/pdf/load";
import { blocksToMarkdown } from "@/lib/ai/blocks-to-markdown";
import { quoteContextMarkdown } from "@/lib/ai/quote-context";
import { claudeGenerate, claudeErrorMessage, hasClaudeKey } from "@/lib/ai/claude";
import type { DocBlock } from "@/lib/pdf/types";

// Heavy AI-drafting path: generate grounded proposal narrative from the quote's
// own structured data (+ optional template / past-quote exemplars), via Claude.
// Phase 1 uses `section` (one section, for the Insert-section menu); `sections`
// (a full approved outline) is Phase 2. Access mirrors /api/ai/write: any quote
// editor (auth + requireWriteAccess) — it writes only the Document narrative.
// See docs/ai-proposal-drafting-design.md.

const MAX_REFERENCES = 2;
const REFERENCE_CHAR_CAP = 6000;

interface Intake {
  tone?: string;
  length?: "short" | "standard" | "detailed";
  emphasis?: string;
}

interface Body {
  quoteId: string;
  section?: string;        // single section name (Phase 1)
  sections?: string[];     // full outline (Phase 2)
  intake?: Intake;
  referenceQuoteIds?: string[];
}

// BlockNote 0.14's markdown parser mangles GFM tables into a malformed `table`
// block (empty content + rows dumped into children) that crashes the table
// extension's mouse handler. The model is told not to use tables, but convert
// any stray table to a bullet list so the parser never produces a table block.
function stripMarkdownTables(md: string): string {
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isRow(lines[i])) {
      while (i < lines.length && (isRow(lines[i]) || isSep(lines[i]))) {
        if (!isSep(lines[i])) {
          const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
          out.push("- " + cells.filter(Boolean).join(" — "));
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

const lengthGuidance: Record<NonNullable<Intake["length"]>, string> = {
  short: "Keep it tight — one short paragraph per section.",
  standard: "Aim for two to three focused paragraphs per section.",
  detailed: "Write a thorough, comprehensive treatment of each section.",
};

const SYSTEM = `You are an expert proposal writer for a Managed Service Provider (MSP), drafting the narrative body of a client-facing proposal.

Hard rules:
- Use ONLY the services, scope, and prices given in the Quote Data. Never invent line items, prices, dates, headcounts, SLAs, or commitments.
- Refer to the pricing table rather than restating specific figures in prose.
- Where a detail isn't provided, write generally or insert a clearly bracketed placeholder like [confirm: implementation timeline].
- Output GitHub-flavored Markdown only — no preamble, no commentary, no code fences around the whole response.
- Do NOT use Markdown tables. Use prose or bullet lists instead (pricing is shown separately by the proposal's own pricing table).
- Write in a confident, professional, client-facing voice. Address the client by name where natural.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

  if (!hasClaudeKey()) {
    return NextResponse.json(
      { error: "AI drafting is not configured. Set ANTHROPIC_API_KEY." },
      { status: 501 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.quoteId) return NextResponse.json({ error: "quoteId is required" }, { status: 400 });

  const sections = body.sections?.length ? body.sections : body.section ? [body.section] : null;
  if (!sections) {
    return NextResponse.json({ error: "section or sections is required" }, { status: 400 });
  }

  // Grounding: the quote's own structured data (client/services/totals).
  const input = await loadSerializeInput(supabase, body.quoteId);
  if (!input) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quoteContext = quoteContextMarkdown(input);

  // Optional exemplars: past proposals (tenant-scoped via RLS), as style samples.
  let exemplars = "";
  const refIds = (body.referenceQuoteIds ?? []).filter((id) => id !== body.quoteId).slice(0, MAX_REFERENCES);
  if (refIds.length) {
    const { data: refs } = await supabase
      .from("quotes")
      .select("title, document_content")
      .in("id", refIds);
    const rendered = (refs ?? [])
      .map((r: { title: string | null; document_content: unknown }) => {
        const md = blocksToMarkdown(r.document_content as DocBlock[]).slice(0, REFERENCE_CHAR_CAP);
        return md ? `### Example proposal: ${r.title ?? "Untitled"}\n${md}` : "";
      })
      .filter(Boolean);
    if (rendered.length) {
      exemplars =
        "\n\n# Reference proposals (examples of STYLE and STRUCTURE only — do not copy their facts or pricing)\n\n" +
        rendered.join("\n\n---\n\n");
    }
  }

  const intake = body.intake ?? {};
  const tone = intake.tone?.trim() || "professional";
  const length = lengthGuidance[intake.length ?? "standard"];
  const emphasis = intake.emphasis?.trim();

  const task =
    sections.length === 1
      ? `Draft the "${sections[0]}" section of this proposal. Return only that section's content (you may include a Markdown heading for it).`
      : `Draft the full proposal narrative with these sections, in order, each under its own Markdown heading:\n${sections
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}`;

  const prompt = `# Quote Data\n\n${quoteContext}${exemplars}\n\n# Instructions\n\nTone: ${tone}. ${length}${
    emphasis ? `\nEmphasize: ${emphasis}.` : ""
  }\n\n${task}`;

  try {
    const raw = await claudeGenerate({
      system: SYSTEM,
      prompt,
      maxTokens: sections.length > 1 ? 8192 : 4096,
    });
    const markdown = stripMarkdownTables(raw);
    if (!markdown) {
      return NextResponse.json({ error: "The AI returned an empty draft. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ markdown });
  } catch (err) {
    console.error("[ai/draft] generation failed:", err);
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }
}
