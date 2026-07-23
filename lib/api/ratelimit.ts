import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "./respond";

// Per-key fixed-window rate limit (no Redis in-stack). Atomic increment via the
// api_rate_increment() definer function (migration 033). Best-effort: if the
// counter store errors, we FAIL OPEN (don't block a legitimate request over an
// infra hiccup). docs §3.4.

export const RATE_LIMIT_PER_MIN = 100;

// Truncate to the current minute (the window bucket key).
function currentWindow(now = Date.now()): string {
  return new Date(Math.floor(now / 60_000) * 60_000).toISOString();
}

// Returns a 429 NextResponse when the key is over the limit, else null.
export async function enforceRateLimit(keyId: string, limit = RATE_LIMIT_PER_MIN): Promise<NextResponse | null> {
  const admin = createAdminClient();
  const window = currentWindow();
  const { data, error } = await admin.rpc("api_rate_increment", { p_key_id: keyId, p_window: window });
  if (error || typeof data !== "number") return null; // fail open
  if (data > limit) {
    const retry = Math.ceil((Date.parse(window) + 60_000 - Date.now()) / 1000);
    return apiError(429, "rate_limited", `Rate limit exceeded (${limit}/min). Retry shortly.`, {
      "Retry-After": String(Math.max(retry, 1)),
    });
  }
  return null;
}
