import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH — rename / edit an organization's name + slug (Platform Admin only).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const admin_user = await getPlatformAdminUser();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  if (!name) return NextResponse.json({ error: "Organization name is required." }, { status: 400 });

  // slug: explicit null/empty clears it; otherwise normalize.
  const rawSlug = body.slug as string | null | undefined;
  const slug =
    rawSlug === undefined ? undefined
    : rawSlug ? rawSlug.trim().toLowerCase().replace(/\s+/g, "-") : null;

  const admin = createAdminClient();
  const update: { name: string; slug?: string | null } = { name };
  if (slug !== undefined) update.slug = slug;

  const { data, error } = await admin
    .from("organizations")
    .update(update)
    .eq("id", orgId)
    .select("id, name, slug, platform_enabled, created_at")
    .single();

  if (error) {
    // Unique-violation on slug → friendly message.
    if (error.code === "23505") return NextResponse.json({ error: "That slug is already in use." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ org: data });
}
