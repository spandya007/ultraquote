// Netlify Scheduled Function — drains due webhook deliveries every 5 minutes by
// calling the CRON_SECRET-gated retry endpoint. This is the automatic retry
// driver for Phase C1 outbound webhooks (immediate delivery happens inline at
// the emit points; THIS is what re-attempts failed/pending deliveries on the
// backoff schedule). See docs/integrations-phase-c-api-webhooks-zapier.md §2.4.
//
// Scheduled functions run ONLY on production (published) deploys, never on
// deploy previews. Requires the CRON_SECRET env var (same secret the endpoint
// checks) to be set on the Netlify site with Functions + Runtime scope.
//
// Netlify injects process.env.URL = the site's primary URL on production.
export default async () => {
  const base = process.env.URL || "https://app.smartprops.io";
  const secret = process.env.CRON_SECRET || "";
  if (!secret) {
    console.warn("[webhook-retry] CRON_SECRET not set — the endpoint will reject this call (403). Set it in Netlify env.");
  }
  try {
    const res = await fetch(`${base}/api/webhooks/dispatch/run`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await res.text();
    console.log(`[webhook-retry] ${res.status} ${body}`);
    return new Response(body, { status: res.status });
  } catch (e) {
    console.error("[webhook-retry] request failed:", e);
    return new Response("error", { status: 500 });
  }
};

// Every 5 minutes (UTC cron). Backoff is 1m→5m→30m→2h→6h, so a 5-min cadence
// means a failed delivery's first retry lands within ~5 min — tighten to
// "*/2 * * * *" if you want faster first retries.
export const config = { schedule: "*/5 * * * *" };
