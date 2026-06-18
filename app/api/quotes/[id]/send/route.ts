import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSerializeInput } from "@/lib/pdf/load";
import { buildSigningHtml } from "@/lib/pdf/serialize";
import { docusealConfigured, createHtmlSubmission, archiveSubmission, type DocusealSubmitter } from "@/lib/docuseal";
import { requireWriteAccess } from "@/lib/access/guard";

export const runtime = "nodejs";

interface Body {
  clientEmail?: string; clientName?: string;
  companyEmail?: string; companyName?: string;
  /** When both parties sign: who goes first, or "together" for parallel signing. */
  firstSigner?: "client" | "tenant" | "together";
  /** Custom notification email (defaults built from the quote/tenant if omitted). */
  emailSubject?: string;
  emailMessage?: string;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

  if (!docusealConfigured()) {
    return NextResponse.json({ error: "E-signature not configured. Set DOCUSEAL_API_TOKEN." }, { status: 501 });
  }

  const input = await loadSerializeInput(supabase, params.id);
  if (!input) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Body;

  // Which parties actually have a field placed in the document? Signature fields
  // map to their signer; an acceptance checkbox is always the Client (customer),
  // so it makes the Client a submitter even without a separate signature field.
  const kinds = new Set<string>();
  for (const b of input.blocks ?? []) {
    if (b.type === "signatureField" || b.type === "initialsField" || b.type === "radioField") kinds.add(b.props?.signer === "tenant" ? "tenant" : "client");
    else if (b.type === "acceptanceField") kinds.add("client");
  }
  if (kinds.size === 0) {
    return NextResponse.json(
      { error: "Add a Signature Field, Initials, or an Acceptance Checkbox to the document before sending." },
      { status: 400 }
    );
  }

  // Signing order (only meaningful when both parties sign): user-selected —
  // client first (default), company first, or both in parallel (same order #).
  const both = kinds.has("client") && kinds.has("tenant");
  const first = body.firstSigner ?? "client";
  const clientOrder = !both ? 0 : first === "tenant" ? 1 : 0;
  const tenantOrder = !both ? 0 : first === "client" ? 1 : 0; // "together" → both 0

  const submitters: (DocusealSubmitter & { signerRole: string; order: number })[] = [];
  if (kinds.has("client")) {
    const email = (body.clientEmail || input.client.contact_email || "").trim();
    const name = (body.clientName || input.client.contact_name || input.client.company_name || "").trim();
    if (!email) return NextResponse.json({ error: "Client signer email is required." }, { status: 400 });
    submitters.push({ role: "Client", email, name, signerRole: "Client", order: clientOrder });
  }
  if (kinds.has("tenant")) {
    const email = (body.companyEmail || input.tenant.email || "").trim();
    const name = (body.companyName || input.tenant.contact_name || input.tenant.name || "").trim();
    if (!email) return NextResponse.json({ error: "Your (company) signer email is required." }, { status: 400 });
    submitters.push({ role: "Company", email, name, signerRole: "MSP Owner", order: tenantOrder });
  }
  submitters.sort((a, b) => a.order - b.order);

  const html = buildSigningHtml(input);
  const name = `${input.quote.quote_number || "Proposal"}${input.quote.title ? ` — ${input.quote.title}` : ""}`;

  // ── Notification email (custom or sensible default) ─────────────────────────
  const tenantName = input.tenant.name || "Your service provider";
  const subject = (body.emailSubject || "").trim()
    || `${tenantName} — proposal ${input.quote.quote_number} is ready for your signature`;
  let emailBody = (body.emailMessage || "").trim()
    || [
      "Hello,",
      "",
      `${tenantName} has prepared the proposal “${input.quote.title || input.quote.quote_number}” for your review and signature.`,
      "",
      "Please open the secure link below to review and sign:",
      "",
      "{{submitter.link}}",
      "",
      "Thank you,",
      tenantName,
    ].join("\n");
  // The signing link is essential — append it if a custom message omitted it.
  if (!emailBody.includes("{{submitter.link}}")) {
    emailBody += "\n\nReview and sign here:\n{{submitter.link}}";
  }

  // ── Create the DocuSeal submission ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  try {
    result = await createHtmlSubmission({
      name,
      html,
      submitters: submitters.map(s => ({ role: s.role, email: s.email, name: s.name, order: s.order })),
      message: { subject, body: emailBody },
      replyTo: input.tenant.email || undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // /submissions/html returns a SUBMISSION OBJECT ({ id, submitters: [...] });
  // other endpoints return a bare array of submitters. Handle both shapes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = Array.isArray(result) ? result : (result?.submitters ?? []);
  const submissionId = String(
    (Array.isArray(result)
      ? (list[0]?.submission_id ?? list[0]?.submission?.id)
      : (result?.id ?? result?.submission_id)) ?? ""
  );
  if (!submissionId) {
    // The webhook matches events to quotes via this id — surface shape surprises.
    console.error("[send] could not parse DocuSeal submission id from response:",
      JSON.stringify(result).slice(0, 500));
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Re-send hygiene (runs only after the new submission was created):
  // 1) Archive any still-pending previous submission so stale emailed links
  //    can't be used to sign an outdated document version.
  // 2) Remove old pending sessions + ALL old signer rows — the webhook's
  //    "all signers signed?" completion check must only count the new attempt.
  //    (Completed/declined sessions are kept for history.)
  const { data: oldPending } = await db
    .from("quote_signature_sessions")
    .select("id, provider_document_id")
    .eq("quote_id", params.id)
    .eq("status", "pending");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const os of (oldPending ?? []) as any[]) {
    if (os.provider_document_id) await archiveSubmission(os.provider_document_id);
    await db.from("quote_signature_sessions").delete().eq("id", os.id);
  }
  await db.from("quote_signers").delete().eq("quote_id", params.id);

  await db.from("quote_signature_sessions").insert({
    quote_id: params.id, provider: "docuseal", provider_document_id: submissionId, status: "pending",
  });

  const nowIso = new Date().toISOString();
  for (const s of submitters) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = list.find((r: any) => (r.email || "").toLowerCase() === s.email.toLowerCase() || r.role === s.role);
    await db.from("quote_signers").insert({
      quote_id: params.id,
      signer_name: s.name || s.email,
      signer_email: s.email,
      role: s.signerRole,
      signing_order: s.order,
      status: "sent",
      provider_signer_id: match?.id ? String(match.id) : null,
      sent_at: nowIso,
    });
  }

  await db.from("quotes").update({ status: "sent", sent_at: nowIso }).eq("id", params.id);

  return NextResponse.json({ ok: true, submissionId, signers: submitters.map(s => s.email) });
}
