import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/user-context";
import { userHasFeature } from "@/lib/billing/entitlements";
import { getClient } from "@/lib/oauth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OAuth 2.1 authorization endpoint (the browser lands here). Validates the
// request, ensures the user is signed in (reusing the Supabase session → tenant),
// and shows a consent screen that POSTs the decision to /api/oauth/authorize.
// docs/integrations-phase-c-api-webhooks-zapier.md Appendix A.2.

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function ErrorScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="SmartProps" className="h-7 mb-4" />
        <h1 className="text-lg font-semibold text-destructive">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2">{detail}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const response_type = one(sp.response_type);
  const client_id = one(sp.client_id);
  const redirect_uri = one(sp.redirect_uri);
  const code_challenge = one(sp.code_challenge);
  const code_challenge_method = one(sp.code_challenge_method) || "S256";
  const scope = one(sp.scope);
  const state = one(sp.state);
  const resource = one(sp.resource);

  // Validate the client + redirect_uri BEFORE trusting anything — never redirect
  // to an unregistered URI (open-redirect / phishing guard).
  const client = client_id ? await getClient(client_id) : null;
  if (!client) return <ErrorScreen title="Unknown application" detail="This client_id is not registered." />;
  if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
    return <ErrorScreen title="Invalid redirect" detail="The redirect_uri does not match this application's registration." />;
  }
  if (response_type !== "code") return <ErrorScreen title="Unsupported request" detail="Only response_type=code is supported." />;
  if (!code_challenge || code_challenge_method !== "S256") {
    return <ErrorScreen title="PKCE required" detail="A code_challenge with method S256 is required." />;
  }

  // Require a signed-in user; bounce through login preserving the full request.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams({ response_type, client_id, redirect_uri, code_challenge, code_challenge_method });
    if (scope) qs.set("scope", scope);
    if (state) qs.set("state", state);
    if (resource) qs.set("resource", resource);
    redirect(`/login?redirectTo=${encodeURIComponent(`/authorize?${qs.toString()}`)}`);
  }

  const ctx = await getUserContext(user!.id);
  const entitled = await userHasFeature(user!.id, "integrations");
  if (!ctx || !entitled) {
    return <ErrorScreen title="Not available on your plan" detail="Connecting AI assistants requires a plan that includes API access. Contact your account owner." />;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantName = (ctx as any).tenant?.name || "your workspace";
  const appName = client.client_name || "An application";
  const requestedWrite = /(^|\s)write(\s|$)/.test(scope || client.scope || "");

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="SmartProps" className="h-7 mb-4" />
        <h1 className="text-lg font-semibold">Authorize access</h1>
        <p className="text-sm text-muted-foreground mt-2">
          <strong className="text-foreground">{appName}</strong> wants to connect to your SmartProps
          workspace <strong className="text-foreground">{tenantName}</strong> as{" "}
          <strong className="text-foreground">{ctx.full_name || user!.email}</strong>.
        </p>

        <form method="POST" action="/api/oauth/authorize" className="mt-5 space-y-4">
          <input type="hidden" name="client_id" value={client_id} />
          <input type="hidden" name="redirect_uri" value={redirect_uri} />
          <input type="hidden" name="code_challenge" value={code_challenge} />
          <input type="hidden" name="code_challenge_method" value={code_challenge_method} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="resource" value={resource} />

          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <input type="checkbox" checked readOnly className="mt-1" />
              <span><strong>Read</strong> your proposals, clients, and catalog.</span>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" name="allow_write" value="1" defaultChecked={requestedWrite} className="mt-1" />
              <span><strong>Write</strong> — create clients on your behalf.</span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            You can revoke this connection anytime in Settings. Sending signature requests is never allowed.
          </p>

          <div className="flex gap-2 justify-end pt-1">
            <button name="decision" value="deny" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Deny</button>
            <button name="decision" value="approve" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Allow</button>
          </div>
        </form>
      </div>
    </main>
  );
}
