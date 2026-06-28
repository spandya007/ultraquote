import { NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { listDueTenantIds, purgeTenant, type PurgeResult } from "@/lib/admin/purge-tenant";

// Purge every tenant whose scheduled-deletion date has arrived. Callable two ways:
//   - by a platform admin (the /admin "Run due deletions" button), or
//   - by an automated job presenting the CRON_SECRET (header or ?secret=),
//     so a Netlify scheduled function / external cron can drive it.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const presented = request.headers.get("x-cron-secret") || url.searchParams.get("secret");
  const cronAuthed = !!cronSecret && presented === cronSecret;

  if (!cronAuthed) {
    const adminUser = await getPlatformAdminUser();
    if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dueIds = await listDueTenantIds();
  const results: PurgeResult[] = [];
  const failures: { tenantId: string; error: string }[] = [];
  for (const id of dueIds) {
    try {
      results.push(await purgeTenant(id));
    } catch (e) {
      failures.push({ tenantId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, purged: results.length, results, failures });
}
