import { NextResponse } from "next/server";
import { requireWebhookOwner } from "@/lib/webhooks/guard";
import { listWebhooks, createWebhook } from "@/lib/webhooks/store";
import { validateWebhookUrl, sanitizeEvents } from "@/lib/webhooks/validate";

export const runtime = "nodejs";

// Owner-only webhook endpoint management (Settings → Integrations → Webhooks).

export async function GET() {
  const gate = await requireWebhookOwner();
  if ("response" in gate) return gate.response;
  return NextResponse.json({ webhooks: await listWebhooks(gate.tenantId) });
}

export async function POST(request: Request) {
  const gate = await requireWebhookOwner();
  if ("response" in gate) return gate.response;

  const body = await request.json().catch(() => ({}));
  const urlCheck = validateWebhookUrl(body.url);
  if ("error" in urlCheck) return NextResponse.json({ error: urlCheck.error }, { status: 400 });

  const events = sanitizeEvents(body.events);
  if (events.length === 0) {
    return NextResponse.json({ error: "Select at least one event." }, { status: 400 });
  }

  const created = await createWebhook({
    tenantId: gate.tenantId,
    url: urlCheck.url,
    events,
    createdBy: gate.userId,
  });
  // The signing secret is returned ONCE here — the client shows it and it's never
  // retrievable again (only regenerable).
  return NextResponse.json({ id: created.id, secret: created.secret });
}
