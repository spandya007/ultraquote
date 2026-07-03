// SINGLE HOME for all editable AI prompt text + model IDs.
//
// The routes import from here and assemble the final prompt; the assembly logic
// (which pieces are included when, and the data interpolation) stays in the
// routes. To change what the AI says, edit the wording HERE.
//
// After editing:
//   • run `npm run type-check` and `npm test`
//   • do NOT alter the JSON-shape instructions/examples in the Outline and
//     Extract-pricing prompts — the routes parse model output against them
//   • keep the grounding guardrails intact ("use ONLY … / never invent prices …")
//
// Models:
//   CLAUDE_MODEL — heavy drafting + outline (Anthropic; lib/ai/claude.ts)
//   GEMINI_MODEL — inline Ask AI + pricing extraction (Google; lib/ai/gemini.ts)

import type { BrandProfile } from "./brand-profile";

export const CLAUDE_MODEL = "claude-opus-4-8";
export const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Author role + brand voice ───────────────────────────────────────────────
// Shared header for AI Draft, Outline, and Ask AI (generate/continue). Built from
// the tenant's brand profile so nothing is hardcoded to a vertical ("MSP"). Empty
// fields are omitted; with nothing set the role is neutral.
const noTrailingPunct = (s: string) => s.replace(/[.,;:!?]+\s*$/, "").trim();
export function brandSystemHeader(p: BrandProfile): string {
  const role = p.businessType
    ? `You are an expert proposal writer for ${p.businessName} — a ${noTrailingPunct(p.businessType)}, drafting the narrative body of a client-facing proposal.`
    : `You are an expert proposal writer for ${p.businessName}, drafting the narrative body of a client-facing proposal.`;
  const about = p.about ? `\nAbout ${p.businessName}: ${p.about}` : "";
  const voice = p.brandVoice
    ? `\nWrite in this brand voice: ${noTrailingPunct(p.brandVoice)}.`
    : `\nWrite in a confident, professional, client-facing voice.`;
  return `${role}${about}${voice}`;
}

// ─── Grounding (lib/ai/quote-context.ts) ─────────────────────────────────────
export const SCENARIOS_GROUNDING_NOTE =
  "_(Do not restate these numbers in prose — the proposal's pricing table shows them. Speak to the scope and value.)_";

// ═══ AI Draft — /api/ai/draft ════════════════════════════════════════════════
export const DRAFT_RULES = `Hard rules:
- Use ONLY the services, scope, and prices given in the Quote Data. Never invent line items, prices, dates, headcounts, SLAs, or commitments.
- Refer to the pricing table rather than restating specific figures in prose.
- Where a detail isn't provided, write generally or insert a clearly bracketed placeholder like [confirm: implementation timeline].
- Output GitHub-flavored Markdown only — no preamble, no commentary, no code fences around the whole response.
- Use level-2 (\`##\`) Markdown headings for section titles — never a top-level (\`#\`) heading (that is reserved for the document title).
- Do NOT use Markdown tables. Use prose or bullet lists instead (pricing is shown separately by the proposal's own pricing table).
- Write about the work and its value, not the reader. Do not address the client by name unless the brand voice explicitly asks you to.
- If Client notes are provided, treat them as internal interview context: tailor the scope and framing to directly address the client's stated pain points, goals, and constraints. Never quote the notes verbatim or reveal that notes exist.`;

export const DRAFT_LENGTH_GUIDANCE: Record<"short" | "standard" | "detailed", string> = {
  short: "Write one short, terse paragraph for the section — concise and high-signal, no filler or wind-up.",
  standard: "Aim for two to three focused paragraphs per section.",
  detailed: "Write a thorough, comprehensive treatment of each section.",
};

export const draftClientNotesBlock = (notes: string) =>
  `\n\n# Client notes (internal interview notes — use these to target the client's pain points and goals; do NOT quote them verbatim or reveal them)\n\n${notes}`;

export const DRAFT_REFERENCE_HEADER =
  "\n\n# Reference proposals (examples of STYLE and STRUCTURE only — do not copy their facts or pricing)\n\n";
export const draftReferenceExemplar = (title: string, md: string) => `### Example proposal: ${title}\n${md}`;

export function draftTask(sections: string[]): string {
  return sections.length === 1
    ? `Draft the "${sections[0]}" section of this proposal. Return only that section's content (you may include a level-2 (\`##\`) Markdown heading for it).`
    : `Draft the full proposal narrative with these sections, in order, each under its own level-2 (\`##\`) Markdown heading:\n${sections
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")}`;
}

const DRAFT_CLOSING_RE = /next step|sign|accept|clos|conclu|proceed/i;
export function draftClosingCta(sections: string[], hasTerms: boolean, force = false): string {
  const isClosing = force || sections.length > 1 || DRAFT_CLOSING_RE.test(sections[0]);
  if (!isClosing) return "";
  return `\n\nEnd ${sections.length > 1 ? "the final section" : "this section"} with a brief (1–2 sentence) call to action inviting the client to review and e-sign this proposal to move forward.${
    hasTerms ? " Also ask them to review and accept the options and terms indicated in the document before signing." : ""
  }`;
}

export function draftInstructions(tone: string, length: string, emphasis?: string): string {
  return `# Instructions\n\nTone: ${tone}. ${length}${emphasis ? `\nEmphasize: ${emphasis}.` : ""}`;
}

// ═══ Outline — /api/ai/outline ═══════════════════════════════════════════════
export const OUTLINE_SYSTEM_SUFFIX = `You are planning the SECTION OUTLINE for a client-facing proposal — not writing it yet. Propose the sections that best fit THIS deal, informed by the services, the client's situation, and any client notes. Prefer 4–7 sections with clear, client-facing titles. Return ONLY JSON.`;

export const OUTLINE_JSON_INSTRUCTION = `Propose the proposal's section outline, ordered as it should appear. Return ONLY a JSON object:
{"sections":[{"title":"Executive Summary","hint":"one-line purpose"}]}
4 to 7 sections. No prose, no code fences.`;

export const OUTLINE_DEFAULT_SECTIONS = [
  { title: "Executive Summary", hint: "Brief overview and value" },
  { title: "Scope of Work", hint: "What's included" },
  { title: "Why Us", hint: "Why this business" },
  { title: "Timeline", hint: "How it rolls out" },
  { title: "Investment", hint: "Points to the pricing table" },
  { title: "Next Steps", hint: "How to proceed" },
];

export const outlineClientNotesBlock = (notes: string) =>
  `\n\n# Client notes (internal — pain points/goals the outline should address)\n\n${notes}`;

// ═══ Ask AI — /api/ai/write (Gemini) ═════════════════════════════════════════
// Selection-edit modes (improve/expand/shorten/grammar/tone): transform ONLY the
// provided text — no deal context, no continuing the document.
export const WRITE_EDIT_SYSTEM = [
  "You are a professional copy editor for business proposals.",
  "Apply ONLY the requested transformation to the text between <text> and </text>.",
  "Critical rules: do NOT add new sentences, sections, pricing, or commentary; do NOT continue the document; do NOT include any preamble, explanation, quotes, or markdown. Output ONLY the transformed version of the provided text.",
];

// Generate/continue: the brand role (brandSystemHeader) + these output rules.
export const WRITE_GENERATE_RULES = [
  "Write in clear, professional, client-ready English. Never use markdown formatting, headings, or bullet symbols — return plain prose paragraphs separated by blank lines.",
  "Do not fabricate specific prices, dates, SLAs, or commitments beyond what the context provides.",
];

export function writeInstruction(mode: string, opts: { prompt?: string; tone?: string }): string {
  switch (mode) {
    case "improve":
      return "Rewrite the following text to be clearer, more professional, and more persuasive for a business proposal. Keep the meaning and approximate length. Return only the rewritten text.";
    case "expand":
      return "Expand the following text into a richer, more detailed version suitable for a business proposal, adding relevant supporting detail without inventing specific facts, numbers, or commitments. Return only the expanded text.";
    case "shorten":
      return "Condense the following text to be more concise while preserving the key points. Return only the shortened text.";
    case "grammar":
      return "Correct any spelling, grammar, and punctuation errors in the following text. Do not change tone, meaning, or wording beyond what is needed. Return only the corrected text.";
    case "tone":
      return `Rewrite the following text in a ${opts.tone || "professional"} tone, suitable for a business proposal. Keep the meaning. Return only the rewritten text.`;
    case "continue":
      return "Continue writing the proposal naturally from where the document leaves off. Write 1–2 cohesive paragraphs that follow logically. Return only the new text to append.";
    case "generate":
    default:
      return `Write proposal content for the following request: "${opts.prompt || ""}". Produce polished, professional prose suitable for a client-facing business proposal. Do not invent specific prices, dates, or commitments. Return only the generated text.`;
  }
}

// ═══ Extract pricing — /api/ai/extract-pricing (Gemini JSON) ═════════════════
export function extractPricingPrompt(tablesJson: string): string {
  return [
    "You are a data-extraction assistant for a quoting tool.",
    "Below are tables extracted from a proposal document (each with an optional preceding heading).",
    "Identify ONLY the tables that contain pricing/line-item information (services or products with prices). IGNORE non-pricing tables (e.g. contact info, schedules, generic field/value tables).",
    "For each pricing table, produce a scenario. Use the table's heading as the scenario name (or a concise sensible name).",
    "For each row, output a line item with: description, billing_period ('Monthly' or 'One Time'), quantity (default 1 if absent), unit_price (a number; if only a line total and quantity are given, compute unit_price = total / quantity), and is_taxable (boolean, default false).",
    "Infer billing_period from column headers/wording (monthly/MRR/recurring → 'Monthly'; setup/one-time/install/hardware → 'One Time'). Strip currency symbols and commas from numbers.",
    'Return ONLY JSON of the form: {"scenarios":[{"name":"...","line_items":[{"description":"...","billing_period":"Monthly","quantity":1,"unit_price":0,"is_taxable":false}]}]}. If no pricing tables are found, return {"scenarios":[]}.',
    "Tables:",
    tablesJson,
  ].join("\n\n");
}
