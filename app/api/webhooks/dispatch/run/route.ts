import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { runDueDeliveries } from "@/lib/webhooks/dispatch";

export const runtime = "nodejs";

// Drains due webhook deliveries (failed/pending whose next_retry_at has arrived),
// retrying each with backoff. Callable two ways — same pattern as
// /api/admin/deletions/run:
//   - by a platform admin (manual), or
//   - by an automated job presenting CRON_SECRET (header `x-cron-secret` or
//     `?secret=`), so a scheduled function / external cron can drive retries.
// Point an external cron (e.g. every 5 min) at
//   POST https://app.smartprops.io/api/webhooks/dispatch/run?secret=<CRON_SECRET>
async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const presented = request.headers.get("x-cron-secret") || url.searchParams.get("secret");
  const cronAuthed = !!cronSecret && presented === cronSecret;

  if (!cronAuthed) {
    const adminUser = await getPlatformAdminUser();
    if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runDueDeliveries();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return handle(request);
}
