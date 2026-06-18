import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/access/guard";

// Statuses a quote may be deleted from: the start state (draft) and the
// terminal rejection state (declined). Anything else (sent/viewed in flight,
// signed = a real executed record, expired = a lapsed real offer) is kept.
const DELETABLE = new Set(["draft", "declined"]);

// Owner-only deep delete of a quote. Child rows (scenarios → line items,
// signers, signature sessions) cascade via FK on delete. RLS also enforces
// owner-only (migration 014); this route adds the status guard + clear errors.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

  // Owner-only at the app layer (RLS backs this up).
  const { data: me } = await db
    .from("users").select("role").eq("id", user.id).single() as { data: { role: string } | null };
  if (me?.role !== "owner") {
    return NextResponse.json({ error: "Only the workspace owner can delete quotes." }, { status: 403 });
  }

  // Load the quote's stored status (RLS scopes to the tenant).
  const { data: quote, error: loadErr } = await db
    .from("quotes").select("id, status, quote_number").eq("id", params.id).single() as {
      data: { id: string; status: string; quote_number: string } | null;
      error: { message: string } | null;
    };
  if (loadErr || !quote) {
    return NextResponse.json({ error: loadErr?.message ?? "Quote not found" }, { status: 404 });
  }

  if (!DELETABLE.has(quote.status)) {
    return NextResponse.json(
      { error: `Quote ${quote.quote_number} is "${quote.status}" — only Draft or Declined quotes can be deleted.` },
      { status: 409 }
    );
  }

  const { error: delErr } = await db.from("quotes").delete().eq("id", params.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, quote_number: quote.quote_number });
}
