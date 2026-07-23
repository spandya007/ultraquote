import { NextResponse } from "next/server";
import { OPENAPI_SPEC } from "@/lib/api/openapi";

export const runtime = "nodejs";

// Public, unauthenticated OpenAPI document for the API. No secrets — just the shape.
export function GET() {
  return NextResponse.json(OPENAPI_SPEC);
}
