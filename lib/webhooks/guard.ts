// The webhook-management routes share the owner + 'integrations' gate with the
// API-key routes. Single source of truth: lib/access/integrations-owner.ts.
export { requireIntegrationsOwner as requireWebhookOwner } from "@/lib/access/integrations-owner";
