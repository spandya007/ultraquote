import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/integrations/crypto";

// Service-role CRUD for tenant_webhooks + webhook_deliveries. Secrets are stored
// AES-256-GCM encrypted and NEVER returned to the browser except the one time
// they're generated (create / regenerate). All reads/writes are scoped by
// tenant_id — the tables have RLS enabled with no policies, so the service-role
// client is the only path in and the tenant filter is the ONLY isolation.
// docs/integrations-phase-c-api-webhooks-zapier.md §2.

export interface WebhookSummary {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  source: string;
  last_status: string | null;
  last_delivery_at: string | null;
  created_at: string;
}

export interface DeliverySummary {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  attempts: number;
  response_code: number | null;
  next_retry_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

// Secret shown once on create/regenerate. Prefix mirrors common conventions.
export function generateWebhookSecret(): string {
  return "whsec_" + crypto.randomBytes(24).toString("hex");
}

export async function listWebhooks(tenantId: string): Promise<WebhookSummary[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_webhooks")
    .select("id, url, events, enabled, source, last_status, last_delivery_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data ?? []) as WebhookSummary[];
}

export async function createWebhook(params: {
  tenantId: string;
  url: string;
  events: string[];
  source?: string;
  createdBy?: string | null;
}): Promise<{ id: string; secret: string }> {
  const admin = createAdminClient();
  const secret = generateWebhookSecret();
  const { data, error } = await admin
    .from("tenant_webhooks")
    .insert({
      tenant_id: params.tenantId,
      url: params.url,
      secret: encryptSecret(secret),
      events: params.events,
      source: params.source ?? "user",
      created_by: params.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createWebhook failed: ${error.message}`);
  return { id: (data as { id: string }).id, secret };
}

// Update mutable fields. Only touches keys that are provided.
export async function updateWebhook(
  id: string,
  tenantId: string,
  patch: { url?: string; events?: string[]; enabled?: boolean }
): Promise<boolean> {
  const admin = createAdminClient();
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.url !== undefined) fields.url = patch.url;
  if (patch.events !== undefined) fields.events = patch.events;
  if (patch.enabled !== undefined) fields.enabled = patch.enabled;
  const { data, error } = await admin
    .from("tenant_webhooks")
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`updateWebhook failed: ${error.message}`);
  return !!data;
}

export async function regenerateSecret(id: string, tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const secret = generateWebhookSecret();
  const { data, error } = await admin
    .from("tenant_webhooks")
    .update({ secret: encryptSecret(secret), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`regenerateSecret failed: ${error.message}`);
  return data ? secret : null;
}

export async function deleteWebhook(id: string, tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_webhooks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`deleteWebhook failed: ${error.message}`);
  return !!data;
}

export async function listDeliveries(
  webhookId: string,
  tenantId: string,
  limit = 20
): Promise<DeliverySummary[]> {
  const admin = createAdminClient();
  // Confirm the webhook belongs to the tenant before exposing its deliveries.
  const { data: owns } = await admin
    .from("tenant_webhooks").select("id").eq("id", webhookId).eq("tenant_id", tenantId).maybeSingle();
  if (!owns) return [];
  const { data } = await admin
    .from("webhook_deliveries")
    .select("id, event_id, event_type, status, attempts, response_code, next_retry_at, created_at, delivered_at")
    .eq("webhook_id", webhookId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as DeliverySummary[];
}

// ── Server-only (dispatch) ────────────────────────────────────────────────────

export interface DispatchWebhook {
  id: string;
  url: string;
  secret: string; // decrypted
  events: string[];
}

// Enabled webhooks for a tenant, with the signing secret decrypted. Server-only.
export async function getEnabledWebhooks(tenantId: string): Promise<DispatchWebhook[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_webhooks")
    .select("id, url, secret, events")
    .eq("tenant_id", tenantId)
    .eq("enabled", true);
  return (data ?? []).map((r: { id: string; url: string; secret: string; events: string[] }) => ({
    id: r.id,
    url: r.url,
    secret: decryptSecret(r.secret),
    events: r.events ?? [],
  }));
}
