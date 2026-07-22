import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/integrations/crypto";
import { signatureHeaders } from "./sign";
import { subscribes, type WebhookEventType } from "./events";
import { buildProposalPayload } from "./payload";
import { getEnabledWebhooks } from "./store";

// Outbound webhook dispatcher. Two entry points:
//   • dispatchProposalEvent() — called at each emit point (send route, DocuSeal
//     webhook). Best-effort: builds the payload, fans out to subscribed endpoints,
//     inserts a delivery row per endpoint, and attempts an immediate POST. NEVER
//     throws to the caller (same swallow contract as createInvoiceOnSigned) so a
//     webhook hiccup can't break sending or the DocuSeal callback.
//   • runDueDeliveries() — the cron drain that retries failed/pending deliveries.
// docs/integrations-phase-c-api-webhooks-zapier.md §2.4.

// Backoff after a failed attempt (immediate attempt is #1). 5 retries → 6 total.
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const DELIVER_TIMEOUT_MS = 10_000;

// Given the number of attempts made so far (>=1), when should the next retry run?
// Returns an ISO timestamp, or null when the delivery is exhausted (→ dead).
export function nextRetryAt(attempts: number, now = Date.now()): string | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[attempts - 1];
  if (delay == null) return null;
  return new Date(now + delay).toISOString();
}

interface DeliveryRow {
  id: string;
  event_id: string;
  event_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  attempts: number;
}

// POST one delivery to one endpoint, then record the outcome + schedule the next
// retry (or mark dead). Never throws. Returns true on 2xx.
async function attemptDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  delivery: DeliveryRow,
  webhook: { id: string; url: string; secret: string }
): Promise<boolean> {
  const rawBody = JSON.stringify(delivery.payload);
  const attempts = delivery.attempts + 1;
  let code: number | null = null;
  let body = "";
  let ok = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVER_TIMEOUT_MS);
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: signatureHeaders({
          secret: webhook.secret,
          eventType: delivery.event_type,
          deliveryId: delivery.id,
          rawBody,
        }),
        body: rawBody,
        signal: controller.signal,
      });
      code = res.status;
      ok = res.ok;
      body = (await res.text().catch(() => "")).slice(0, 500);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    body = (e as Error).message?.slice(0, 500) ?? "request failed";
  }

  const nowIso = new Date().toISOString();
  const status = ok ? "success" : nextRetryAt(attempts) ? "failed" : "dead";
  await admin
    .from("webhook_deliveries")
    .update({
      status,
      attempts,
      response_code: code,
      response_body: body || null,
      next_retry_at: ok ? null : nextRetryAt(attempts),
      delivered_at: ok ? nowIso : null,
    })
    .eq("id", delivery.id);
  await admin
    .from("tenant_webhooks")
    .update({ last_status: ok ? "success" : status, last_delivery_at: nowIso })
    .eq("id", webhook.id);

  return ok;
}

// Emit a proposal event to all subscribed, enabled endpoints. Best-effort.
export async function dispatchProposalEvent(quoteId: string, type: WebhookEventType): Promise<void> {
  try {
    const admin = createAdminClient();
    const built = await buildProposalPayload(admin, quoteId, type);
    if (!built) return;

    const webhooks = (await getEnabledWebhooks(built.tenantId)).filter((w) => subscribes(w.events, type));
    if (webhooks.length === 0) return;

    for (const w of webhooks) {
      // Give each endpoint its OWN event id (unique per delivery) so consumers'
      // idempotency keys don't collide across a fan-out.
      const payload = { ...built.payload };
      const { data: row } = await admin
        .from("webhook_deliveries")
        .insert({
          webhook_id: w.id,
          event_id: payload.id,
          event_type: type,
          payload,
          status: "pending",
        })
        .select("id, event_id, event_type, payload, attempts")
        .single();
      if (row) await attemptDelivery(admin, row as DeliveryRow, w);
    }
  } catch (e) {
    console.error(`[webhooks] dispatch ${type} for ${quoteId} failed:`, e);
  }
}

// Cron drain: retry every due (pending/failed, next_retry_at reached) delivery.
// Called by /api/webhooks/dispatch/run. Returns a small summary for the caller.
export async function runDueDeliveries(limit = 50): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("webhook_deliveries")
    .select("id, event_id, event_type, payload, attempts, webhook_id, next_retry_at, status")
    .in("status", ["pending", "failed"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  let succeeded = 0, failed = 0, skipped = 0;
  for (const d of (due ?? []) as Array<DeliveryRow & { webhook_id: string }>) {
    // Endpoint may have been deleted or disabled since the delivery was queued.
    const { data: wh } = await admin
      .from("tenant_webhooks")
      .select("id, url, secret, enabled")
      .eq("id", d.webhook_id)
      .maybeSingle();
    if (!wh || !wh.enabled) {
      await admin.from("webhook_deliveries").update({ status: "dead" }).eq("id", d.id);
      skipped++;
      continue;
    }
    const ok = await attemptDelivery(admin, d, { id: wh.id, url: wh.url, secret: decryptSecret(wh.secret) });
    if (ok) succeeded++; else failed++;
  }
  return { processed: (due ?? []).length, succeeded, failed, skipped };
}

// UI "resend": re-attempt an existing delivery immediately, tenant-scoped.
export async function resendDelivery(deliveryId: string, tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: d } = await admin
    .from("webhook_deliveries")
    .select("id, event_id, event_type, payload, attempts, webhook_id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!d) return false;
  const { data: wh } = await admin
    .from("tenant_webhooks")
    .select("id, url, secret, enabled")
    .eq("id", d.webhook_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!wh) return false;
  return attemptDelivery(admin, d as DeliveryRow, { id: wh.id, url: wh.url, secret: decryptSecret(wh.secret) });
}
