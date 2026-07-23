import { NextResponse } from "next/server";
import { requireIntegrationsOwner } from "@/lib/access/integrations-owner";
import { listApiKeys, createApiKey, type ApiScope } from "@/lib/api/keys";

export const runtime = "nodejs";

// Owner-only API key management (Settings → Integrations → API keys).

export async function GET() {
  const gate = await requireIntegrationsOwner();
  if ("response" in gate) return gate.response;
  return NextResponse.json({ keys: await listApiKeys(gate.tenantId) });
}

export async function POST(request: Request) {
  const gate = await requireIntegrationsOwner();
  if ("response" in gate) return gate.response;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A key name is required." }, { status: 400 });

  // Scopes: read always; write only if requested. Default read-only.
  const scopes: ApiScope[] = ["read"];
  if (body.write === true || (Array.isArray(body.scopes) && body.scopes.includes("write"))) {
    scopes.push("write");
  }

  const created = await createApiKey({ tenantId: gate.tenantId, name, scopes, createdBy: gate.userId });
  // Full key returned ONCE — never retrievable again.
  return NextResponse.json({ id: created.id, key: created.full, prefix: created.prefix, scopes });
}
