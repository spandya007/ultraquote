// QuickBooks Online configuration + endpoints. See
// docs/integrations-accounting-psa-research.md §3 and docs/integrations-phase-a-plan.md (A3).

export interface QboConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  env: "sandbox" | "production";
}

// OAuth endpoints (host-wide, not per-environment).
export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_MINOR_VERSION = "75";

// Read + validate env. Throws a clear error if the QBO app isn't configured.
export function getQboConfig(): QboConfig {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;
  const env = (process.env.QBO_ENV ?? "sandbox") as QboConfig["env"];
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("QuickBooks is not configured (QBO_CLIENT_ID / QBO_CLIENT_SECRET / QBO_REDIRECT_URI).");
  }
  return { clientId, clientSecret, redirectUri, env };
}

// Whether QBO is configured at all (used to gate the connect UI/route gracefully).
export function isQboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_REDIRECT_URI);
}

// Per-company REST API base (the realmId path + minorversion are added per call).
export function qboApiBase(env: QboConfig["env"]): string {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}
