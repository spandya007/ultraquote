import { NextResponse } from "next/server";
import { requireIntegrationsOwner } from "@/lib/access/integrations-owner";
import { revokeApiKey } from "@/lib/api/keys";

export const runtime = "nodejs";

// DELETE /api/keys/:id — revoke a key (owner-only). Idempotent: 404 if already
// revoked or not this tenant's.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireIntegrationsOwner();
  if ("response" in gate) return gate.response;
  const ok = await revokeApiKey(params.id, gate.tenantId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
