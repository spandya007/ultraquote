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

export interface ClaudeUsage {
  input_tokens: number;                 // fresh (uncached) input
  output_tokens: number;
  cache_creation_input_tokens: number;  // prompt-cache WRITE
  cache_read_input_tokens: number;      // prompt-cache READ
}

// Single-shot generation. `cachedPrefix` is the large, STABLE part of the user
// message (e.g. quote data + notes + reference exemplars) that repeats across
// several calls — it (and the system prompt) are marked with cache_control so the
// 2nd..Nth call within ~5 min read it at ~10% of input cost. `prompt` is the
// small, varying part (instructions/task). Set cache:false for one-off calls
// (e.g. the outline), where a cache write would just add cost with no read.
export async function claudeGenerate(opts: {
  system: string;
  cachedPrefix?: string;
  prompt: string;
  maxTokens?: number;
  cache?: boolean;
}): Promise<{ text: string; usage: ClaudeUsage }> {
  const useCache = opts.cache !== false;
  const ephemeral = { type: "ephemeral" as const };

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: opts.system, ...(useCache ? { cache_control: ephemeral } : {}) },
  ];

  const content: Anthropic.TextBlockParam[] = [];
  if (opts.cachedPrefix) {
    content.push({ type: "text", text: opts.cachedPrefix, ...(useCache ? { cache_control: ephemeral } : {}) });
  }
  content.push({ type: "text", text: opts.prompt });

  const message = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system,
    messages: [{ role: "user", content }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const u = message.usage;
  return {
    text,
    usage: {
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    },
  };
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
