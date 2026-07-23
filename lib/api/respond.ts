import { NextResponse } from "next/server";

// Uniform JSON envelopes for the public API. Errors are always
// `{ error: { code, message } }` so clients can branch on `code`.

export function apiJson(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers });
}

export function apiError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
