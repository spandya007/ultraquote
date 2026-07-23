import { withApiKey } from "@/lib/api/handler";
import { apiJson, apiError } from "@/lib/api/respond";
import { createWebhook } from "@/lib/webhooks/store";
import { validateWebhookUrl, sanitizeEvents } from "@/lib/webhooks/validate";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";

export const runtime = "nodejs";

// POST /api/v1/webhooks — subscribe a target URL to events. This is what a
// Zapier REST-hook "subscribe" calls; it writes a tenant_webhooks row with
// source='zapier'. Returns { id } (used later to unsubscribe). Requires 'write'.
export async function POST(req: Request) {
  return withApiKey(req, { scope: "write" }, async ({ tenantId }) => {
    const body = await req.json().catch(() => ({}));
    const urlCheck = validateWebhookUrl(body.url ?? body.target_url ?? body.hookUrl);
    if ("error" in urlCheck) return apiError(400, "invalid_request", urlCheck.error);
    // Default to all events when unspecified (Zapier registers one hook per trigger).
    const events = sanitizeEvents(body.events);
    const created = await createWebhook({
      tenantId,
      url: urlCheck.url,
      events: events.length ? events : [...WEBHOOK_EVENTS],
      source: "zapier",
    });
    return apiJson({ id: created.id }, 201);
  });
}
