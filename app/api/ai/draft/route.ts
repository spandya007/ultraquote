import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/access/guard";
import { loadSerializeInput } from "@/lib/pdf/load";
import { blocksToMarkdown } from "@/lib/ai/blocks-to-markdown";
import { quoteContextMarkdown } from "@/lib/ai/quote-context";
import { claudeGenerate, claudeErrorMessage, hasClaudeKey } from "@/lib/ai/claude";
import { stripMarkdownTables } from "@/lib/ai/strip-markdown-tables";
import { getBrandProfile } from "@/lib/ai/brand-profile";
import { logAiUsage } from "@/lib/ai/usage";
import {
  brandSystemHeader, CLAUDE_MODEL, DRAFT_RULES, DRAFT_LENGTH_GUIDANCE, draftClientNotesBlock,
  DRAFT_REFERENCE_HEADER, draftReferenceExemplar, draftTask, draftClosingCta, draftInstructions,
} from "@/lib/ai/prompts";
import type { DocBlock } from "@/lib/pdf/types";

// Heavy AI-drafting path: generate grounded proposal narrative from the quote's
// own structured data (+ optional past-quote exemplars), via Claude. Phase 1 uses
// `section` (one section); `sections` (a full approved outline) is Phase 2. Access
// mirrors /api/ai/write: any quote editor. All prompt wording lives in
// lib/ai/prompts.ts. See docs/ai-proposal-drafting-design.md.

// Give the serverless function headroom for the Claude call (Netlify default is
// 10s; 26s is the max for a synchronous function). The client also drafts
// multi-section proposals ONE section at a time so no single request runs long.
export const maxDuration = 26;

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
  // Signing context detected from the current document (for the closing CTA).
  signing?: { hasTerms?: boolean; hasSignature?: boolean };
  // Force the closing e-sign CTA even for a single section (the client drafts a
  // full proposal section-by-section and sets this on the LAST section).
  forceClosingCta?: boolean;
}

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

  // Author role + voice from the tenant's brand profile (tenant → org → neutral).
  const { data: qRow } = (await supabase
    .from("quotes")
    .select("tenant_id, client_notes")
    .eq("id", body.quoteId)
    .maybeSingle()) as { data: { tenant_id: string; client_notes: string | null } | null };
  const profile = await getBrandProfile(supabase, qRow?.tenant_id ?? "");
  const system = `${brandSystemHeader(profile)}\n\n${DRAFT_RULES}`;

  // Internal interview notes (pain points/goals) — steer the draft; never quoted.
  const clientNotes = (qRow?.client_notes ?? "").trim();
  const notesBlock = clientNotes ? draftClientNotesBlock(clientNotes.slice(0, 4000)) : "";

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
        return md ? draftReferenceExemplar(r.title ?? "Untitled", md) : "";
      })
      .filter(Boolean);
    if (rendered.length) {
      exemplars = DRAFT_REFERENCE_HEADER + rendered.join("\n\n---\n\n");
    }
  }

  const intake = body.intake ?? {};
  const tone = intake.tone?.trim() || "professional";
  const length = DRAFT_LENGTH_GUIDANCE[intake.length ?? "standard"];
  const emphasis = intake.emphasis?.trim();

  const task = draftTask(sections);
  const cta = draftClosingCta(sections, !!body.signing?.hasTerms, !!body.forceClosingCta);

  // Split for prompt caching: the quote-data/notes/references prefix is IDENTICAL
  // across a full proposal's per-section calls → cached; the instructions/task/CTA
  // suffix varies per section → fresh. (Leads with "\n\n" to preserve layout.)
  const cachedPrefix = `# Quote Data\n\n${quoteContext}${notesBlock}${exemplars}`;
  const varyingPrompt = `\n\n${draftInstructions(tone, length, emphasis)}\n\n${task}${cta}`;

  try {
    const { text: raw, usage } = await claudeGenerate({
      system,
      cachedPrefix,
      prompt: varyingPrompt,
      maxTokens: sections.length > 1 ? 8192 : 4096,
      cache: true,
    });
    await logAiUsage({
      tenantId: qRow?.tenant_id,
      userId: user.id,
      quoteId: body.quoteId,
      kind: sections.length > 1 ? "draft_full" : "draft_section",
      model: CLAUDE_MODEL,
      usage,
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
