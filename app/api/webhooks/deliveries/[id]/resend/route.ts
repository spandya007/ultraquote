import { NextResponse } from "next/server";
import { requireWebhookOwner } from "@/lib/webhooks/guard";
import { resendDelivery } from "@/lib/webhooks/dispatch";

export const runtime = "nodejs";

// Re-attempt a single past delivery immediately (owner "Resend" button).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireWebhookOwner();
  if ("response" in gate) return gate.response;
  const ok = await resendDelivery(params.id, gate.tenantId);
  return NextResponse.json({ ok });
}
