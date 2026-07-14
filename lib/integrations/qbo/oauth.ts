import { getQboConfig, QBO_TOKEN_URL, QBO_AUTHORIZE_URL, QBO_SCOPE, QBO_REVOKE_URL } from "./config";

// QuickBooks OAuth 2.0 token exchange + refresh. Access tokens last 1h; refresh
// tokens rotate (persist the newest one every time — see client.ts).
// docs/integrations-accounting-psa-research.md §3.

export interface QboTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds (access token)
  x_refresh_token_expires_in?: number;
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getQboConfig();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

// Build the consent-screen URL the owner is redirected to.
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getQboConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: QBO_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${QBO_AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<QboTokens> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QBO token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as QboTokens;
}

export async function exchangeCodeForTokens(code: string): Promise<QboTokens> {
  const { redirectUri } = getQboConfig();
  return tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri })
  );
}

export async function refreshTokens(refreshToken: string): Promise<QboTokens> {
  return tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
  );
}

// Best-effort revoke on disconnect (ignore failures — we delete our row regardless).
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(QBO_REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* ignore */
  }
}
