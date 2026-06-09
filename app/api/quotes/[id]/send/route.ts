import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSerializeInput } from "@/lib/pdf/load";
import { buildSigningHtml } from "@/lib/pdf/serialize";
import { docusealConfigured, createHtmlSubmission, type DocusealSubmitter } from "@/lib/docuseal";

export const runtime = "nodejs";

interface Body {
  clientEmail?: string; clientName?: string;
  companyEmail?: string; companyName?: string;
  /** When both parties sign: who goes first, or "together" for parallel signing. */
  firstSigner?: "client" | "tenant" | "together";
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!docusealConfigured()) {
    return NextResponse.json({ error: "E-signature not configured. Set DOCUSEAL_API_TOKEN." }, { status: 501 });
  }

  const input = await loadSerializeInput(supabase, params.id);
  if (!input) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Body;

  // Which parties actually have a signature field placed in the document?
  const kinds = new Set(
    (input.blocks ?? [])
      .filter(b => b.type === "signatureField")
      .map(b => (b.props?.signer === "tenant" ? "tenant" : "client"))
  );
  if (kinds.size === 0) {
    return NextResponse.json(
      { error: "Add at least one Signature Field to the document (type “/signature”) before sending." },
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

  // ── Create the DocuSeal submission ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  try {
    result = await createHtmlSubmission({
      name,
      html,
      submitters: submitters.map(s => ({ role: s.role, email: s.email, name: s.name, order: s.order })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Response is an array of submitter objects; all share submission_id.
  const list = Array.isArray(result) ? result : [];
  const submissionId = String(list[0]?.submission_id ?? list[0]?.submission?.id ?? "");

  // ── Persist ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
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
