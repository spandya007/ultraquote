import { WEBHOOK_EVENTS, type WebhookEventType } from "./events";

// Endpoint URL must be an absolute http(s) URL. https is required except for
// localhost (so a dev tunnel / local receiver can be tested).
export function validateWebhookUrl(raw: unknown): { url: string } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { error: "URL is required." };
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { error: "Enter a valid URL (including https://)." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "URL must be http or https." };
  }
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol === "http:" && !isLocal) {
    return { error: "Use https:// for the endpoint URL." };
  }
  return { url: parsed.toString() };
}

// Keep only recognised event types. Empty is allowed and means "all events".
export function sanitizeEvents(raw: unknown): WebhookEventType[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(WEBHOOK_EVENTS);
  return raw.filter((e): e is WebhookEventType => typeof e === "string" && valid.has(e));
}
