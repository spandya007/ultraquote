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

// Builds the dynamic system-prompt header (role + about + voice) from a profile.
// Empty fields are omitted; with nothing set the role is neutral (never "MSP").
export function brandSystemHeader(p: BrandProfile): string {
  const role = p.businessType
    ? `You are an expert proposal writer for ${p.businessName} — a ${p.businessType}, drafting the narrative body of a client-facing proposal.`
    : `You are an expert proposal writer for ${p.businessName}, drafting the narrative body of a client-facing proposal.`;
  const about = p.about ? `\nAbout ${p.businessName}: ${p.about}` : "";
  const voice = p.brandVoice
    ? `\nWrite in this brand voice: ${p.brandVoice}.`
    : `\nWrite in a confident, professional, client-facing voice.`;
  return `${role}${about}${voice}`;
}
