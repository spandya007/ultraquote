import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Discovery root — points at the OpenAPI doc and summarizes auth. Unauthenticated.
export function GET() {
  return NextResponse.json({
    name: "SmartProps API",
    version: "2026-07-01",
    documentation: "https://app.smartprops.io/api/v1/openapi.json",
    authentication: "Bearer API key — Settings → Integrations → API keys. Requires the 'integrations' plan feature.",
    rate_limit: "100 requests/minute per key",
    endpoints: [
      "GET /api/v1/proposals",
      "GET /api/v1/proposals/{id}",
      "GET /api/v1/clients",
      "POST /api/v1/clients",
      "GET /api/v1/products",
      "POST /api/v1/webhooks",
      "DELETE /api/v1/webhooks/{id}",
    ],
  });
}
