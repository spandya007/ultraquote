import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadSerializeInput } from "@/lib/pdf/load";
import { buildFullHtml, buildHeaderTemplate, buildFooterTemplate } from "@/lib/pdf/serialize";

// Renders the quote to PDF by sending the serialized HTML to the external
// Puppeteer service (see /pdf-service). Returns the PDF as a download.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceUrl = process.env.PDF_SERVICE_URL;
  if (!serviceUrl) {
    return NextResponse.json(
      { error: "PDF service not configured. Set PDF_SERVICE_URL." },
      { status: 501 }
    );
  }

  const input = await loadSerializeInput(supabase, params.id);
  if (!input) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const html = buildFullHtml(input);
  const headerHtml = buildHeaderTemplate(input);
  const footerHtml = buildFooterTemplate(input);

  let pdfRes: Response;
  try {
    pdfRes = await fetch(`${serviceUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PDF_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.PDF_SERVICE_TOKEN}` } : {}),
      },
      body: JSON.stringify({ html, headerHtml, footerHtml }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `PDF service unreachable: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  if (!pdfRes.ok) {
    const detail = await pdfRes.text().catch(() => "");
    return NextResponse.json(
      { error: `PDF service error (${pdfRes.status})`, detail },
      { status: 502 }
    );
  }

  const pdf = await pdfRes.arrayBuffer();
  const filename = `${input.quote.quote_number || "quote"}.pdf`;

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
