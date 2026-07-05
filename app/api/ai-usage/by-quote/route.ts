import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Per-quote AI CALL COUNTS for the "Show AI usage" toggle on the Quotes list.
// Available to ALL tenant members (not just owners), but returns COUNTS ONLY —
// no cost — so cost stays owner-only (ai_usage RLS is unchanged). Scoped to the
// caller's own tenant via the service-role client.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = (await supabase
    .from("users").select("tenant_id").eq("id", user.id).maybeSingle()) as { data: { tenant_id: string } | null };
  if (!me?.tenant_id) return NextResponse.json({ usage: {} });

  const { data } = await createAdminClient()
    .from("ai_usage")
    .select("quote_id, kind")
    .eq("tenant_id", me.tenant_id)
    .not("quote_id", "is", null);

  // draft_* (outline + sections) → "draft"; write (Ask AI) → "askAi". extract has
  // no quote_id so it's excluded by the filter above.
  const usage: Record<string, { draft: number; askAi: number }> = {};
  for (const r of (data ?? []) as { quote_id: string; kind: string }[]) {
    const e = usage[r.quote_id] ?? (usage[r.quote_id] = { draft: 0, askAi: 0 });
    if (r.kind === "write") e.askAi++;
    else if (r.kind.startsWith("draft")) e.draft++;
  }

  return NextResponse.json({ usage });
}
