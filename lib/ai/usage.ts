import { createAdminClient } from "@/lib/supabase/admin";
import { computeCostUsd, type TokenUsage } from "./cost";
import { maxDraftCallsPerQuote, maxDraftCallsPerTenantMonth } from "./limits";

// Count Claude `draft_*` calls (draft_section / draft_full / draft_outline) already
// logged for a quote — the basis for the per-quote AI hard cap. Service-role (the
// ai_usage RLS is owner-read only). Missing table (024 not run) → 0 so drafting
// isn't blocked before the ledger exists.
export async function countDraftCallsForQuote(quoteId: string): Promise<number> {
  try {
    const { count, error } = await createAdminClient()
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", quoteId)
      .like("kind", "draft%");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Read a quote's carried-forward AI budget (set when it was duplicated) so a copy
// doesn't reset the per-quote cap. Degrades to 0 if the column doesn't exist yet
// (migration 026 not run).
async function carriedDraftCalls(admin: ReturnType<typeof createAdminClient>, quoteId: string): Promise<number> {
  try {
    const { data } = await admin.from("quotes").select("ai_draft_calls_carried").eq("id", quoteId).maybeSingle();
    return (data as { ai_draft_calls_carried?: number } | null)?.ai_draft_calls_carried ?? 0;
  } catch {
    return 0;
  }
}

// Enforce the AI draft caps for a quote BEFORE spending on Claude. Returns a
// user-facing message to 429 with, or null if the request is allowed:
//   1. Per-quote:  (logged draft_* rows + carried-forward budget) ≥ per-quote cap.
//   2. Per-tenant: draft_* rows this calendar month ≥ per-tenant monthly cap.
// All reads are service-role (ai_usage RLS is owner-read only); every failure
// degrades to "allow" so a metering hiccup never blocks a legit user.
export async function aiDraftLimitBlock(quoteId: string): Promise<string | null> {
  const admin = createAdminClient();

  // Quote's tenant (for the per-tenant cap) — read separately so a missing
  // carried column can't take the tenant_id down with it.
  let tenantId: string | null = null;
  try {
    const { data } = await admin.from("quotes").select("tenant_id").eq("id", quoteId).maybeSingle();
    tenantId = (data as { tenant_id?: string } | null)?.tenant_id ?? null;
  } catch { /* ignore */ }

  // 1. Per-quote cap (includes any carried-forward budget from a duplicate).
  const perQuote = maxDraftCallsPerQuote();
  const used = (await countDraftCallsForQuote(quoteId)) + (await carriedDraftCalls(admin, quoteId));
  if (used >= perQuote) {
    return `This quote has reached its AI drafting limit (${perQuote} AI actions). Please continue refining the draft manually.`;
  }

  // 2. Per-tenant monthly cap (abuse circuit-breaker).
  if (tenantId) {
    const perTenant = maxDraftCallsPerTenantMonth();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    try {
      const { count } = await admin
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .like("kind", "draft%")
        .gte("created_at", monthStart);
      if ((count ?? 0) >= perTenant) {
        return `Your workspace has reached its monthly AI drafting limit (${perTenant} AI actions). It resets at the start of next month.`;
      }
    } catch { /* ignore — allow */ }
  }

  return null;
}

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
