import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geminiGenerate, geminiErrorMessage } from "@/lib/ai/gemini";
import { requireWriteAccess } from "@/lib/access/guard";
import { getBrandProfile } from "@/lib/ai/brand-profile";
import { logAiUsage } from "@/lib/ai/usage";
import { GEMINI_MODEL, WRITE_EDIT_SYSTEM, WRITE_GENERATE_RULES, writeInstruction, brandSystemHeader } from "@/lib/ai/prompts";

// AI writing assistant for the proposal Document. Calls Google Gemini Flash
// server-side (key never reaches the browser) and returns generated/edited text.
// Generate/continue use the tenant's brand profile (same voice as AI Draft);
// all prompt wording lives in lib/ai/prompts.ts.

type Mode = "improve" | "expand" | "shorten" | "grammar" | "tone" | "generate" | "continue";

interface Body {
  quoteId: string;
  mode: Mode;
  text?: string;          // selected text (selection actions)
  prompt?: string;        // user instruction (generate)
  tone?: string;          // tone target (tone mode)
  documentText?: string;  // current document plain text, for grounding
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

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

  // ── Grounding context + brand profile — generate/continue only ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  // Resolve the tenant once for the usage ledger — works for every mode (the
  // selection-edit modes don't otherwise load the quote).
  let tenantId: string | null = null;
  if (body.quoteId) {
    const { data: qMeta } = await db.from("quotes").select("tenant_id").eq("id", body.quoteId).maybeSingle();
    tenantId = qMeta?.tenant_id ?? null;
  }
  let context = "";
  // Neutral fallback role (used if there's no quote to resolve a profile from).
  let brandHeader = brandSystemHeader({ businessName: "your company", businessType: null, about: null, brandVoice: null });
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
      // Author role + voice from the tenant's brand profile (tenant → org → neutral).
      brandHeader = brandSystemHeader(await getBrandProfile(supabase, q.tenant_id));

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
      ...WRITE_EDIT_SYSTEM,
      writeInstruction(body.mode, { prompt: body.prompt, tone: body.tone }),
      `<text>\n${body.text}\n</text>`,
    );
  } else {
    // Generative: brand-profile writer persona + plain-prose rules + deal grounding.
    parts.push(brandHeader, ...WRITE_GENERATE_RULES);
    if (context) parts.push(context);
    if (body.documentText) {
      parts.push(`Current document so far (for context only — do not repeat it):\n"""\n${body.documentText.slice(0, 8000)}\n"""`);
    }
    parts.push(writeInstruction(body.mode, { prompt: body.prompt, tone: body.tone }));
  }

  const fullPrompt = parts.join("\n\n");
  const temperature = isSelectionEdit ? (body.mode === "grammar" ? 0.1 : 0.3) : 0.7;

  // ── Call Gemini ────────────────────────────────────────────────────────────
  let resp: Response;
  try {
    resp = await geminiGenerate(GEMINI_MODEL, apiKey, {
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

  await logAiUsage({
    tenantId,
    userId: user.id,
    quoteId: body.quoteId,
    kind: "write",
    model: GEMINI_MODEL,
    usage: {
      input_tokens: data?.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
    },
  });

  return NextResponse.json({ text: textOut });
}
