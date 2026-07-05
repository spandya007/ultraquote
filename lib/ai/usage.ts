import { createAdminClient } from "@/lib/supabase/admin";
import { computeCostUsd, type TokenUsage } from "./cost";

// Append one row to the ai_usage ledger, via the service-role client (RLS lets
// only owners READ; writes are service-role only). BEST-EFFORT: a logging failure
// must never break the user's request — callers should not await this in a way
// that can throw, and we also swallow errors here.
export async function logAiUsage(entry: {
  tenantId: string | null | undefined;
  userId?: string | null;
  quoteId?: string | null;
  kind: string;   // 'draft_section' | 'draft_full' | 'draft_outline' | 'write' | 'extract_pricing'
  model: string;
  usage: TokenUsage;
}): Promise<void> {
  try {
    if (!entry.tenantId) return;
    const u = entry.usage ?? {};
    await createAdminClient().from("ai_usage").insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId ?? null,
      quote_id: entry.quoteId ?? null,
      kind: entry.kind,
      model: entry.model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cost_usd: computeCostUsd(entry.model, u),
    });
  } catch (e) {
    console.error("[ai_usage] log failed:", e);
  }
}
