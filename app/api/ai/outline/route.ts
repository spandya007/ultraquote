import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/access/guard";
import { loadSerializeInput } from "@/lib/pdf/load";
import { quoteContextMarkdown } from "@/lib/ai/quote-context";
import { claudeGenerate, claudeErrorMessage, hasClaudeKey } from "@/lib/ai/claude";
import { getBrandProfile, brandSystemHeader } from "@/lib/ai/brand-profile";

// Phase 2 of AI proposal drafting: propose an editable SECTION OUTLINE tailored
// to this quote (services + client notes + brand), which the user reviews/edits
// before the /api/ai/draft call writes each section. Same access + grounding as
// /api/ai/draft. See docs/ai-proposal-drafting-design.md §3.

const DEFAULT_SECTIONS = [
  { title: "Executive Summary", hint: "Brief overview and value" },
  { title: "Scope of Work", hint: "What's included" },
  { title: "Why Us", hint: "Why this business" },
  { title: "Timeline", hint: "How it rolls out" },
  { title: "Investment", hint: "Points to the pricing table" },
  { title: "Next Steps", hint: "How to proceed" },
];

interface Body {
  quoteId: string;
  intake?: { tone?: string; length?: string; emphasis?: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSections(raw: string): { title: string; hint?: string }[] {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed?.sections) ? parsed.sections : [];
    return arr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((s: any) => ({
        title: String(s?.title ?? "").trim().slice(0, 80),
        hint: s?.hint ? String(s.hint).trim().slice(0, 120) : undefined,
      }))
      .filter((s: { title: string }) => s.title)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

  if (!hasClaudeKey()) {
    return NextResponse.json({ error: "AI drafting is not configured. Set ANTHROPIC_API_KEY." }, { status: 501 });
  }

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.quoteId) return NextResponse.json({ error: "quoteId is required" }, { status: 400 });

  const input = await loadSerializeInput(supabase, body.quoteId);
  if (!input) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  const quoteContext = quoteContextMarkdown(input);

  const { data: qRow } = (await supabase
    .from("quotes")
    .select("tenant_id, client_notes")
    .eq("id", body.quoteId)
    .maybeSingle()) as { data: { tenant_id: string; client_notes: string | null } | null };
  const profile = await getBrandProfile(supabase, qRow?.tenant_id ?? "");
  const clientNotes = (qRow?.client_notes ?? "").trim();
  const notesBlock = clientNotes
    ? `\n\n# Client notes (internal — pain points/goals the outline should address)\n\n${clientNotes.slice(0, 4000)}`
    : "";

  const emphasis = (body.intake?.emphasis ?? "").trim();

  const system = `${brandSystemHeader(profile)}

You are planning the SECTION OUTLINE for a client-facing proposal — not writing it yet. Propose the sections that best fit THIS deal, informed by the services, the client's situation, and any client notes. Prefer 4–7 sections with clear, client-facing titles. Return ONLY JSON.`;

  const prompt = `# Quote Data\n\n${quoteContext}${notesBlock}\n\n# Instructions\n${
    emphasis ? `Emphasize: ${emphasis}.\n` : ""
  }Propose the proposal's section outline, ordered as it should appear. Return ONLY a JSON object:
{"sections":[{"title":"Executive Summary","hint":"one-line purpose"}]}
4 to 7 sections. No prose, no code fences.`;

  try {
    const raw = await claudeGenerate({ system, prompt, maxTokens: 1024 });
    const sections = parseSections(raw);
    return NextResponse.json({ sections: sections.length ? sections : DEFAULT_SECTIONS });
  } catch (err) {
    console.error("[ai/outline] failed:", err);
    return NextResponse.json({ error: claudeErrorMessage(err) }, { status: 502 });
  }
}
