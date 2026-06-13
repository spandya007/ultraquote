import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// Platform admin edits the tenant's platform-managed identity fields
// (Company Name + Contact Email), which tenants can't change themselves.
// Runs as service role, so the protect_tenant_admin_fields trigger allows it.
// Body: { name: string, email?: string|null }
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { name?: string; email?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  const email = body.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid contact email" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tenants").update({ name, email }).eq("id", params.id);
  if (error) {
    console.error("tenant profile update failed:", error);
    return NextResponse.json({ error: "Failed to update tenant profile" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, name, email });
}
