import crypto from "crypto";

// Outbound webhook event vocabulary (Phase C1). v1 events are all fired from
// server routes we already control (send + DocuSeal webhook) — no DB triggers.
// docs/integrations-phase-c-api-webhooks-zapier.md §2.

export const WEBHOOK_EVENTS = [
  "proposal.sent",
  "proposal.viewed",
  "proposal.signed",
  "proposal.declined",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

// Bumped only on a breaking payload change (additive fields don't bump it).
export const WEBHOOK_API_VERSION = "2026-07-01";

export function isWebhookEvent(v: unknown): v is WebhookEventType {
  return typeof v === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(v);
}

// Human labels for the Settings event picker.
export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  "proposal.sent": "Proposal sent",
  "proposal.viewed": "Proposal viewed",
  "proposal.signed": "Proposal signed",
  "proposal.declined": "Proposal declined",
};

// Unique, opaque idempotency key the consumer dedupes on. A re-send of a proposal
// produces a fresh event id (a genuinely new event), per the design.
export function newEventId(): string {
  return "evt_" + crypto.randomUUID().replace(/-/g, "");
}

// Does a webhook subscribed to `events` want this type? An empty array = all.
export function subscribes(events: string[] | null | undefined, type: WebhookEventType): boolean {
  if (!events || events.length === 0) return true;
  return events.includes(type);
}
