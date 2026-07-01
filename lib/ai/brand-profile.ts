import { createAdminClient } from "@/lib/supabase/admin";

// Resolves the business / brand-voice profile that shapes the AI's author role
// and voice, so nothing is hardcoded to "MSP". Resolution per field:
//   tenant value  →  org default (if the tenant belongs to an org)  →  null
// businessName is always the tenant name. With everything null the caller falls
// back to a neutral role. See docs/brand-voice-profile-design.md.

export interface BrandProfile {
  businessName: string;
  businessType: string | null;
  about: string | null;
  brandVoice: string | null;
}

// Field caps (token + prompt-cache predictability) — mirror the Settings UI.
const CAPS = { businessType: 120, about: 1000, brandVoice: 500 } as const;
const clean = (s: string | null | undefined, cap: number): string | null => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, cap) : null;
};
const pick = (tenantVal: string | null | undefined, orgVal: string | null | undefined, cap: number) =>
  clean(tenantVal, cap) ?? clean(orgVal, cap);

export async function getBrandProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tenantId: string
): Promise<BrandProfile> {
  // tenant (name + org link) and tenant_settings are readable under the caller's
  // RLS; the organizations table is service-role only, so the org default read
  // uses the admin client (scoped to the tenant's own org).
  const [{ data: tenant }, { data: ts }] = await Promise.all([
    supabase.from("tenants").select("name, organization_id").eq("id", tenantId).maybeSingle(),
    supabase
      .from("tenant_settings")
      .select("business_type, business_about, brand_voice")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  let org: { default_business_type: string | null; default_business_about: string | null; default_brand_voice: string | null } | null = null;
  if (tenant?.organization_id) {
    const { data } = await createAdminClient()
      .from("organizations")
      .select("default_business_type, default_business_about, default_brand_voice")
      .eq("id", tenant.organization_id)
      .maybeSingle();
    org = data ?? null;
  }

  return {
    businessName: tenant?.name?.trim() || "your company",
    businessType: pick(ts?.business_type, org?.default_business_type, CAPS.businessType),
    about: pick(ts?.business_about, org?.default_business_about, CAPS.about),
    brandVoice: pick(ts?.brand_voice, org?.default_brand_voice, CAPS.brandVoice),
  };
}

// The prompt-building header (role + about + voice) moved to lib/ai/prompts.ts
// (brandSystemHeader) — the single home for editable prompt text.
