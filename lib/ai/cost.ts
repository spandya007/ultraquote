// Per-model token rates (USD per 1,000,000 tokens) + cost computation for the
// ai_usage ledger. Snapshot rates — update here when Anthropic / Google pricing
// changes. tokens are the durable truth; cost_usd is a snapshot at insert time.

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number; // Anthropic prompt-cache WRITE
  cache_read_input_tokens?: number;     // Anthropic prompt-cache READ
}

interface Rate {
  input: number;        // $/1M fresh input
  output: number;       // $/1M output
  cacheWrite?: number;  // $/1M cache write (Anthropic ≈ 1.25× input)
  cacheRead?: number;   // $/1M cache read  (Anthropic ≈ 0.10× input)
}

// USD per 1,000,000 tokens (published rates).
const RATES: Record<string, Rate> = {
  "claude-opus-4-8":  { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.5 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

export function computeCostUsd(model: string, u: TokenUsage): number {
  const r = RATES[model];
  if (!r) return 0; // unknown model → cost 0 (tokens are still recorded)
  const PER = 1_000_000;
  const input  = (u.input_tokens ?? 0) * r.input;
  const output = (u.output_tokens ?? 0) * r.output;
  const write  = (u.cache_creation_input_tokens ?? 0) * (r.cacheWrite ?? r.input);
  const read   = (u.cache_read_input_tokens ?? 0) * (r.cacheRead ?? r.input);
  return (input + output + write + read) / PER;
}
