import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "./prompts";

// Thin wrapper around the Anthropic SDK for the heavy AI-drafting paths
// (/api/ai/draft, /api/ai/outline). Claude handles the customer-facing proposal
// prose; the cheaper inline ops (improve/expand/tone) stay on Gemini Flash in
// lib/ai/gemini.ts. The SDK auto-retries 429/5xx with backoff (max_retries=2).
// Model ID lives in lib/ai/prompts.ts (CLAUDE_MODEL).

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the environment (server-side only).
  if (!client) client = new Anthropic();
  return client;
}

export function hasClaudeKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Single-shot generation: system + one user message → concatenated text. */
export async function claudeGenerate(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const message = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Friendly, user-facing message for a failed Claude request. */
export function claudeErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError)
    return "AI rate limit reached. Please wait a few seconds and try again.";
  if (err instanceof Anthropic.AuthenticationError)
    return "AI is not configured correctly. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)
    return "The AI service is busy right now. Please try again in a moment.";
  return "AI request failed. Please try again.";
}
