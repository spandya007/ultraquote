import { NextResponse } from "next/server";
import { requireWebhookOwner } from "@/lib/webhooks/guard";
import { listDeliveries } from "@/lib/webhooks/store";

export const runtime = "nodejs";

// Recent delivery attempts for one endpoint (health list in the Settings UI).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireWebhookOwner();
  if ("response" in gate) return gate.response;
  return NextResponse.json({ deliveries: await listDeliveries(params.id, gate.tenantId) });
}
