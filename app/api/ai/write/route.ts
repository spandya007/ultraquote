import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiGenerate, geminiErrorMessage } from "@/lib/ai/gemini";

// AI writing assistant for the proposal Document. Calls Google Gemini Flash
// server-side (key never reaches the browser) and returns generated/edited text.

type Mode = "improve" | "expand" | "shorten" | "grammar" | "tone" | "generate" | "continue";

interface Body {
  quoteId: string;
  mode: Mode;
  text?: string;          // selected text (selection actions)
  prompt?: string;        // user instruction (generate)
  tone?: string;          // tone target (tone mode)
  documentText?: string;  // current document plain text, for grounding
}

const MODEL = "gemini-2.5-flash";

function instructionFor(b: Body): string {
  switch (b.mode) {
    case "improve":
      return "Rewrite the following text to be clearer, more professional, and more persuasive for a business proposal. Keep the meaning and approximate length. Return only the rewritten text.";
    case "expand":
      return "Expand the following text into a richer, more detailed version suitable for a business proposal, adding relevant supporting detail without inventing specific facts, numbers, or commitments. Return only the expanded text.";
    case "shorten":
      return "Condense the following text to be more concise while preserving the key points. Return only the shortened text.";
    case "grammar":
      return "Correct any spelling, grammar, and punctuation errors in the following text. Do not change tone, meaning, or wording beyond what is needed. Return only the corrected text.";
    case "tone":
      return `Rewrite the following text in a ${b.tone || "professional"} tone, suitable for a business proposal. Keep the meaning. Return only the rewritten text.`;
    case "continue":
      return "Continue writing the proposal naturally from where the document leaves off. Write 1–2 cohesive paragraphs that follow logically. Return only the new text to append.";
    case "generate":
    default:
      return `Write proposal content for the following request: "${b.prompt || ""}". Produce polished, professional prose suitable for a client-facing business proposal. Do not invent specific prices, dates, or commitments. Return only the generated text.`;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured. Set GEMINI_API_KEY." },
      { status: 501 }
    );
  }

  const body = (await request.json()) as Body;
  if (!body.mode) return NextResponse.json({ error: "mode is required" }, { status: 400 });
  if ((["improve", "expand", "shorten", "grammar", "tone"] as Mode[]).includes(body.mode) && !body.text) {
    return NextResponse.json({ error: "Select some text first" }, { status: 400 });
  }
  if (body.mode === "generate" && !body.prompt) {
    return NextResponse.json({ error: "Describe what to write" }, { status: 400 });
  }

  // Selection-edit modes transform ONLY the provided text — no deal context or
  // document grounding (which would tempt the model to write a whole proposal).
  const isSelectionEdit = (["improve", "expand", "shorten", "grammar", "tone"] as Mode[]).includes(body.mode);

  // ── Grounding context (client + tenant + pricing) — generate/continue only ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  let context = "";
  if (!isSelectionEdit && body.quoteId) {
    const { data: q } = await db
      .from("quotes")
      .select(`
        tenant_id,
        client:clients(company_name, contact_name),
        scenarios:quote_scenarios!quote_id(
          name, is_recommended,
          line_items:quote_line_items(billing_period, quantity, unit_price)
        )
      `)
      .eq("id", body.quoteId)
      .single();

    if (q) {
      const { data: tenant } = await db
        .from("tenants").select("name").eq("id", q.tenant_id).single();

      const lines: string[] = [];
      if (tenant?.name) lines.push(`Service provider (us): ${tenant.name}`);
      if (q.client?.company_name) lines.push(`Client: ${q.client.company_name}${q.client.contact_name ? ` (contact: ${q.client.contact_name})` : ""}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (q.scenarios ?? []) as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monthly = (s.line_items ?? []).filter((i: any) => i.billing_period === "Monthly")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .reduce((sum: number, i: any) => sum + i.quantity * (i.unit_price ?? 0), 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onetime = (s.line_items ?? []).filter((i: any) => i.billing_period === "One Time")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .reduce((sum: number, i: any) => sum + i.quantity * (i.unit_price ?? 0), 0);
        lines.push(`Option "${s.name}"${s.is_recommended ? " (recommended)" : ""}: $${monthly.toFixed(2)}/mo + $${onetime.toFixed(2)} one-time`);
      }
      if (lines.length) context = `Deal context:\n${lines.join("\n")}\n`;
    }
  }

  // ── Build the prompt ───────────────────────────────────────────────────────
  const parts: string[] = [];

  if (isSelectionEdit) {
    // Tightly scoped: transform ONLY the given text, add nothing.
    parts.push(
      "You are a professional copy editor for business proposals.",
      "Apply ONLY the requested transformation to the text between <text> and </text>.",
      "Critical rules: do NOT add new sentences, sections, pricing, or commentary; do NOT continue the document; do NOT include any preamble, explanation, quotes, or markdown. Output ONLY the transformed version of the provided text.",
      instructionFor(body),
      `<text>\n${body.text}\n</text>`,
    );
  } else {
    // Generative: full writer persona with deal grounding.
    parts.push(
      "You are an expert proposal writer for a Managed Service Provider (MSP).",
      "Write in clear, professional, client-ready English. Never use markdown formatting, headings, or bullet symbols — return plain prose paragraphs separated by blank lines.",
      "Do not fabricate specific prices, dates, SLAs, or commitments beyond what the context provides.",
    );
    if (context) parts.push(context);
    if (body.documentText) {
      parts.push(`Current document so far (for context only — do not repeat it):\n"""\n${body.documentText.slice(0, 8000)}\n"""`);
    }
    parts.push(instructionFor(body));
  }

  const fullPrompt = parts.join("\n\n");
  const temperature = isSelectionEdit ? (body.mode === "grammar" ? 0.1 : 0.3) : 0.7;

  // ── Call Gemini ────────────────────────────────────────────────────────────
  let resp: Response;
  try {
    resp = await geminiGenerate(MODEL, apiKey, {
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: 1536,
        // gemini-2.5-flash is a "thinking" model; disable thinking so the
        // whole token budget goes to the answer (faster, no truncation).
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `AI service unreachable: ${(e as Error).message}` }, { status: 502 });
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return NextResponse.json({ error: geminiErrorMessage(resp.status), detail }, { status: 502 });
  }

  const data = await resp.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textOut: string = (data?.candidates?.[0]?.content?.parts ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => p?.text ?? "")
    .join("")
    .trim();

  if (!textOut) {
    return NextResponse.json({ error: "AI returned no text (possibly blocked). Try rephrasing." }, { status: 502 });
  }

  return NextResponse.json({ text: textOut });
}
