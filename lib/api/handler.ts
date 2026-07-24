import { NextResponse } from "next/server";
import { tenantHasFeature } from "@/lib/billing/entitlements";
import { authenticateApiKey, type ApiScope } from "./keys";
import { enforceRateLimit } from "./ratelimit";
import { ScopedDb } from "./scoped";
import { apiError } from "./respond";

// Wraps a public /api/v1 handler with the full gate: bearer auth → 'integrations'
// entitlement → per-key rate limit → scope check. On success the handler gets a
// ScopedDb (tenant-pinned) plus the resolved scopes. Uncaught handler errors
// become a clean 500. docs §3.

export interface ApiContext {
  tenantId: string;
  scopes: string[];
  keyId: string;
  userId: string | null;
  keyName: string | null;
  db: ScopedDb;
}

export async function withApiKey(
  req: Request,
  opts: { scope?: ApiScope },
  handler: (ctx: ApiContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const auth = await authenticateApiKey(req);
  if ("response" in auth) return auth.response;

  // A tenant that lost the 'integrations' entitlement loses API access even if a
  // key still exists.
  if (!(await tenantHasFeature(auth.tenantId, "integrations"))) {
    return apiError(403, "not_entitled", "This workspace's plan does not include API access.");
  }

  const limited = await enforceRateLimit(auth.keyId);
  if (limited) return limited;

  if (opts.scope === "write" && !auth.scopes.includes("write")) {
    return apiError(403, "forbidden", "This API key is read-only. A key with the 'write' scope is required.");
  }

  try {
    return await handler({
      tenantId: auth.tenantId,
      scopes: auth.scopes,
      keyId: auth.keyId,
      userId: auth.userId,
      keyName: auth.keyName,
      db: new ScopedDb(auth.tenantId),
    });
  } catch (e) {
    console.error("[api/v1] handler error:", e);
    return apiError(500, "internal_error", "Something went wrong.");
  }
}
