// AI usage limits (server-side). Configurable via env so ops can tune without a
// deploy of code. See docs/pricing-model-design.md §12.3 / §13.6.

const DEFAULT_MAX_DRAFT_CALLS_PER_QUOTE = 25;

// Hard cap on Claude `draft_*` calls (outline + section drafts) per quote. A full
// proposal draft is ~7 calls, so 25 ≈ 3.5 full drafts. Flat across all tiers — AI
// is a fair-use ceiling, not a tier feature. Override with the env var
// MAX_AI_DRAFT_CALLS_PER_QUOTE (a positive integer); falls back to 25.
export function maxDraftCallsPerQuote(): number {
  const raw = process.env.MAX_AI_DRAFT_CALLS_PER_QUOTE;
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_DRAFT_CALLS_PER_QUOTE;
}
