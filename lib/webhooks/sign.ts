import crypto from "crypto";

// HMAC-SHA256 request signing for outbound webhooks (cf. lib/integrations/oauth-state.ts).
// The signed string is `${timestamp}.${rawBody}` so consumers can reject replays
// by checking the timestamp skew before comparing signatures. Consumers recompute
// HMAC(secret, `${X-SmartProps-Timestamp}.${rawBody}`) and constant-time compare.

export function signBody(secret: string, timestamp: string, rawBody: string): string {
  const mac = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `sha256=${mac}`;
}

// Standard delivery headers for a signed POST.
export function signatureHeaders(params: {
  secret: string;
  eventType: string;
  deliveryId: string;
  rawBody: string;
  timestamp?: string;
}): Record<string, string> {
  const timestamp = params.timestamp ?? new Date().toISOString();
  return {
    "Content-Type": "application/json",
    "User-Agent": "SmartProps-Webhooks/1.0",
    "X-SmartProps-Event": params.eventType,
    "X-SmartProps-Delivery": params.deliveryId,
    "X-SmartProps-Timestamp": timestamp,
    "X-SmartProps-Signature": signBody(params.secret, timestamp, params.rawBody),
  };
}
