import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseClientsCsvText } from "@/lib/import/csv-clients";
import { requireWriteAccess } from "@/lib/access/guard";

type AnyRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireWriteAccess();
  if ("response" in gate) return gate.response;

  const { data: userData } = await db
    .from("users")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single() as { data: { tenant_id: string; role: string } | null };

  if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (userData.role !== "owner") {
    return NextResponse.json({ error: "Only the tenant owner can import clients" }, { status: 403 });
  }
  const tenant_id = userData.tenant_id;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const { clients, error: parseError } = parseClientsCsvText(text);
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of clients) {
    try {
      const payload: AnyRecord = {
        contact_name:            c.contact_name,
        contact_email:           c.contact_email,
        contact_phone:           c.contact_phone,
        secondary_contact_name:  c.secondary_contact_name,
        secondary_contact_email: c.secondary_contact_email,
        secondary_contact_phone: c.secondary_contact_phone,
        address_street:          c.address_street,
        address_suite:           c.address_suite,
        address_city:            c.address_city,
        address_state:           c.address_state,
        address_postal:          c.address_postal,
        address_country:         c.address_country,
        notes:                   c.notes,
      };

      // Re-import idempotency: match by company name (case-insensitive) within
      // the tenant → update in place; a new name creates a new client.
      const { data: existing } = await db
        .from("clients")
        .select("id")
        .eq("tenant_id", tenant_id)
        .ilike("company_name", c.company_name.replace(/([%_\\])/g, "\\$1"))
        .limit(1)
        .maybeSingle() as { data: { id: string } | null };

      if (existing) {
        await db.from("clients").update(payload).eq("id", existing.id);
        updated++;
      } else {
        const { error: insErr } = await db
          .from("clients")
          .insert({ tenant_id, company_name: c.company_name, is_active: true, ...payload });
        if (insErr) throw new Error(insErr.message);
        imported++;
      }
    } catch (err) {
      errors.push(`${c.company_name}: ${err instanceof Error ? err.message : "unknown error"}`);
      skipped++;
    }
  }

  return NextResponse.json({ imported, updated, skipped, errors, total: clients.length });
}
