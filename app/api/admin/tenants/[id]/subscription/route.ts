import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminUser } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEndDate } from "@/lib/access/subscription";
import type { SubscriptionTerm } from "@/types";

const TERMS: SubscriptionTerm[] = ["monthly", "quarterly", "yearly", "custom"];

// Platform admin sets/updates a tenant's subscription window.
// Body: { start: 'YYYY-MM-DD', term?: SubscriptionTerm, end?: 'YYYY-MM-DD' }
// - term omitted/empty  → Unlimited (subscription_end = null)
// - non-custom term      → end computed from start+term (explicit end overrides)
// - 'custom'             → end required
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await getPlatformAdminUser();
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { start?: string; term?: string; end?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const start = body.start?.trim();
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json({ error: "A valid start date is required" }, { status: 400 });
  }

  const rawTerm = body.term?.trim();
  // Unlimited: no term → no end date.
  if (!rawTerm) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tenants")
      .update({ subscription_start: start, subscription_term: null, subscription_end: null })
      .eq("id", params.id);
    if (error) {
      console.error("subscription update failed:", error);
      return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, subscription_start: start, subscription_term: null, subscription_end: null });
  }

  const term = rawTerm as SubscriptionTerm;
  if (!TERMS.includes(term)) {
    return NextResponse.json({ error: "A valid term is required" }, { status: 400 });
  }

  let end = body.end?.trim() || null;
  if (term === "custom") {
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return NextResponse.json({ error: "A custom term requires an end date" }, { status: 400 });
    }
  } else if (!end) {
    end = computeEndDate(start, term);
  }
  if (end && end < start) {
    return NextResponse.json({ error: "End date cannot be before the start date" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tenants")
    .update({ subscription_start: start, subscription_term: term, subscription_end: end })
    .eq("id", params.id);
  if (error) {
    console.error("subscription update failed:", error);
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscription_start: start, subscription_term: term, subscription_end: end });
}
