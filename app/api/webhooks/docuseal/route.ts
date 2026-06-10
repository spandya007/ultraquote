import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Receives DocuSeal webhook events (configured at console.docuseal.com/webhooks
// with the URL  https://<site>/api/webhooks/docuseal?secret=<DOCUSEAL_WEBHOOK_SECRET>).
// Uses the service-role client (no user session) and always returns 200 so
// DocuSeal doesn't retry indefinitely on our-side issues.

export async function POST(request: NextRequest) {
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.nextUrl.searchParams.get("secret") || request.headers.get("x-webhook-secret");
    if (provided !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: true }); }

  const eventType: string = payload?.event_type || payload?.event || "";
  const data = payload?.data ?? {};
  const submissionId = String(data.submission_id ?? data.submission?.id ?? data.id ?? "");
  const submitterId = data.id != null ? String(data.id) : "";
  const email: string = (data.email || "").toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documents: any[] = data.documents ?? data.submission?.documents ?? [];
  const signedUrl: string | null = documents[0]?.url ?? null;

  const db = createAdminClient();

  // Find the quote via the signature session.
  let { data: session } = await db
    .from("quote_signature_sessions")
    .select("id, quote_id, status")
    .eq("provider_document_id", submissionId)
    .maybeSingle();

  // Fallback: match via the submitter id recorded on a signer row, then
  // backfill the session's provider_document_id for future events.
  if (!session && submitterId) {
    const { data: signerRow } = await db
      .from("quote_signers")
      .select("quote_id")
      .eq("provider_signer_id", submitterId)
      .maybeSingle();
    if (signerRow) {
      const { data: fallback } = await db
        .from("quote_signature_sessions")
        .select("id, quote_id, status")
        .eq("quote_id", signerRow.quote_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallback) {
        session = fallback;
        if (submissionId) {
          await db.from("quote_signature_sessions")
            .update({ provider_document_id: submissionId })
            .eq("id", fallback.id);
        }
      }
    }
  }
  if (!session) return NextResponse.json({ ok: true }); // unknown submission — ignore

  const quoteId = session.quote_id;
  const nowIso = new Date().toISOString();

  // Helper: which signer row this event refers to.
  async function matchSigner() {
    let qb = db.from("quote_signers").select("id, status").eq("quote_id", quoteId);
    if (submitterId) qb = qb.eq("provider_signer_id", submitterId);
    else if (email) qb = qb.eq("signer_email", email);
    const { data } = await qb.maybeSingle();
    return data as { id: string; status: string } | null;
  }

  if (eventType === "form.viewed") {
    const signer = await matchSigner();
    if (signer && signer.status === "sent") await db.from("quote_signers").update({ status: "viewed" }).eq("id", signer.id);
    if (session.status === "pending") await db.from("quotes").update({ status: "viewed" }).eq("id", quoteId).eq("status", "sent");
  } else if (eventType === "form.declined" || eventType === "submission.declined") {
    const reason: string | null = data.decline_reason || null;
    const signer = await matchSigner();
    if (signer) {
      await db.from("quote_signers")
        .update({ status: "declined", decline_reason: reason })
        .eq("id", signer.id);
    }
    await db.from("quote_signature_sessions").update({ status: "declined" }).eq("id", session.id);
    await db.from("quotes").update({ status: "declined" }).eq("id", quoteId);
    // Surface the reason in the quote's Internal Notes so it's visible in the
    // editor's right panel (guarded so a webhook redelivery doesn't duplicate it).
    if (reason) {
      const { data: qrow } = await db.from("quotes").select("notes").eq("id", quoteId).single();
      const line = `⚠ Declined by ${data.email || "signer"}: ${reason}`;
      const notes: string = qrow?.notes ?? "";
      if (!notes.includes(line)) {
        await db.from("quotes").update({ notes: notes ? `${notes}\n${line}` : line }).eq("id", quoteId);
      }
    }
  } else if (eventType === "form.completed" || eventType === "submission.completed") {
    const signer = await matchSigner();
    if (signer) await db.from("quote_signers").update({ status: "signed", signed_at: nowIso }).eq("id", signer.id);

    // All signers done? → mark the quote signed.
    const { data: remaining } = await db
      .from("quote_signers").select("id").eq("quote_id", quoteId).neq("status", "signed");
    const allSigned = !remaining || remaining.length === 0;
    if (allSigned || eventType === "submission.completed") {
      await db.from("quote_signature_sessions")
        .update({ status: "completed", signed_document_url: signedUrl, completed_at: nowIso })
        .eq("id", session.id);
      await db.from("quotes")
        .update({ status: "signed", signed_at: nowIso, pdf_url: signedUrl ?? undefined })
        .eq("id", quoteId);
    }
  }

  return NextResponse.json({ ok: true });
}
