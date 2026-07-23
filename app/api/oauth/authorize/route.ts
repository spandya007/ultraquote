import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/user-context";
import { userHasFeature } from "@/lib/billing/entitlements";
import { getClient, issueAuthCode } from "@/lib/oauth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent decision (POSTed by the /authorize page). Re-validates everything
// server-side — the user identity comes from the SESSION, never the form — then
// issues a single-use authorization code and redirects back to the client.
export async function POST(req: Request) {
  const form = await req.formData();
  const get = (k: string) => String(form.get(k) ?? "");
  const client_id = get("client_id");
  const redirect_uri = get("redirect_uri");
  const code_challenge = get("code_challenge");
  const code_challenge_method = get("code_challenge_method") || "S256";
  const state = get("state");
  const resource = get("resource");
  const decision = get("decision");
  const allowWrite = form.get("allow_write") === "1";

  // Never redirect to an unregistered URI.
  const client = client_id ? await getClient(client_id) : null;
  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    return NextResponse.json({ error: "invalid_client", error_description: "Unknown client or redirect_uri." }, { status: 400 });
  }

  const back = (params: Record<string, string>) => {
    const url = new URL(redirect_uri);
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url, { status: 303 });
  };

  if (decision !== "approve") return back({ error: "access_denied" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back({ error: "access_denied", error_description: "not_signed_in" });

  const ctx = await getUserContext(user.id);
  if (!ctx || !(await userHasFeature(user.id, "integrations"))) {
    return back({ error: "access_denied", error_description: "not_entitled" });
  }
  if (!code_challenge || code_challenge_method !== "S256") {
    return back({ error: "invalid_request", error_description: "pkce_required" });
  }

  const scope = allowWrite ? "read write" : "read";
  const code = await issueAuthCode({
    client_id, user_id: user.id, tenant_id: ctx.tenant_id, redirect_uri,
    code_challenge, code_challenge_method, scope, resource: resource || null,
  });
  return back({ code });
}
