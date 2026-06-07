import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSerializeInput } from "@/lib/pdf/load";
import { buildFullHtml } from "@/lib/pdf/serialize";

// Returns the rendered proposal as a standalone HTML page — used as the src of
// the in-app Preview iframe and as the source for PDF generation.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = await loadSerializeInput(supabase, params.id);
  if (!input) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const html = buildFullHtml(input);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
