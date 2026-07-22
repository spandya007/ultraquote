import { NextResponse } from "next/server";
import { requireWebhookOwner } from "@/lib/webhooks/guard";
import { updateWebhook, deleteWebhook, regenerateSecret } from "@/lib/webhooks/store";
import { validateWebhookUrl, sanitizeEvents } from "@/lib/webhooks/validate";

export const runtime = "nodejs";

// PATCH: toggle enabled, edit url/events, or regenerate the secret ({ action: "regenerate" }).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const gate = await requireWebhookOwner();
  if ("response" in gate) return gate.response;

  const body = await request.json().catch(() => ({}));

  if (body.action === "regenerate") {
    const secret = await regenerateSecret(params.id, gate.tenantId);
    if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ secret });
  }

  const patch: { url?: string; events?: string[]; enabled?: boolean } = {};
  if (body.url !== undefined) {
    const urlCheck = validateWebhookUrl(body.url);
    if ("error" in urlCheck) return NextResponse.json({ error: urlCheck.error }, { status: 400 });
    patch.url = urlCheck.url;
  }
  if (body.events !== undefined) {
    const events = sanitizeEvents(body.events);
    if (events.length === 0) return NextResponse.json({ error: "Select at least one event." }, { status: 400 });
    patch.events = events;
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const ok = await updateWebhook(params.id, gate.tenantId, patch);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireWebhookOwner();
  if ("response" in gate) return gate.response;
  const ok = await deleteWebhook(params.id, gate.tenantId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
