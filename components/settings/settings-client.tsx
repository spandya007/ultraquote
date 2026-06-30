"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Building2, SlidersHorizontal, Upload, Trash2, Loader2, FolderTree, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { CategoriesCard } from "@/components/settings/categories-card";

const STORAGE_SCHEME = "sb-storage://";

interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  contact_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface TenantSettings {
  id: string;
  tenant_id: string;
  default_tax_rate: number | null;
  default_valid_days: number;
  quote_number_prefix: string;
  quote_number_sequence: number;
  default_payment_terms: string;
  default_font: string | null;
  business_type: string | null;
  business_about: string | null;
  brand_voice: string | null;
}

interface Props {
  tenantId: string;
  tenant: Tenant | null;
  settings: TenantSettings | null;
  /** Members see settings view-only; only the tenant owner can change them. */
  isOwner: boolean;
}

function inputCls(error?: boolean) {
  return cn(
    "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2",
    error ? "border-destructive focus:ring-destructive/40" : "focus:ring-ring"
  );
}

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-semibold text-base">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

export function SettingsClient({ tenantId, tenant, settings, isOwner }: Props) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const toast = useToast();
  const router = useRouter();

  // ── Logo state ──────────────────────────────────────────────────────────────
  const [logoUrl,      setLogoUrl]      = useState<string | null>(tenant?.logo_url ?? null);
  const [logoPreview,  setLogoPreview]  = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Resolve the stored sb-storage:// URL to a signed URL for on-screen preview.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!logoUrl) { setLogoPreview(null); return; }
      if (logoUrl.startsWith(STORAGE_SCHEME)) {
        const rest = logoUrl.slice(STORAGE_SCHEME.length);
        const slash = rest.indexOf("/");
        const bucket = rest.slice(0, slash);
        const path = rest.slice(slash + 1);
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        if (active) setLogoPreview(data?.signedUrl ?? null);
      } else if (active) {
        setLogoPreview(logoUrl);
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoUrl]);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2 MB"); return; }
    setUploadingLogo(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `tenant-logos/${tenantId}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("proposal-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setUploadingLogo(false); return; }
    const url = `${STORAGE_SCHEME}proposal-assets/${path}`;
    const { error } = await db.from("tenants").update({ logo_url: url }).eq("id", tenantId);
    setUploadingLogo(false);
    if (error) { toast.error("Failed to save logo"); return; }
    setLogoUrl(url);
    toast.success("Logo uploaded");
  }

  async function removeLogo() {
    const { error } = await db.from("tenants").update({ logo_url: null }).eq("id", tenantId);
    if (error) { toast.error("Failed to remove logo"); return; }
    setLogoUrl(null);
    toast.success("Logo removed");
  }

  // ── Tenant profile state ──────────────────────────────────────────────────
  // name + email are platform-managed → read directly from the latest server
  // props (not local state) so an admin-side change shows after a refresh.
  const name = tenant?.name ?? "";
  const email = tenant?.email ?? "";
  const [contactName, setContactName] = useState(tenant?.contact_name ?? "");
  const [phone,       setPhone]       = useState(tenant?.phone        ?? "");
  const [address,     setAddress]     = useState(tenant?.address      ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Quote defaults state ──────────────────────────────────────────────────
  const [prefix,       setPrefix]       = useState(settings?.quote_number_prefix    ?? "QUOTE");
  const [taxRate,      setTaxRate]      = useState(
    settings?.default_tax_rate != null ? (settings.default_tax_rate * 100).toFixed(2) : ""
  );
  const [validDays,    setValidDays]    = useState(String(settings?.default_valid_days    ?? 30));
  const [paymentTerms, setPaymentTerms] = useState(settings?.default_payment_terms ?? "Net 30");
  const [font,         setFont]         = useState(settings?.default_font ?? "sans");
  const [savingDefaults, setSavingDefaults] = useState(false);

  // ── Proposal voice (AI brand profile) state ───────────────────────────────
  const [bizType,  setBizType]  = useState(settings?.business_type  ?? "");
  const [bizAbout, setBizAbout] = useState(settings?.business_about ?? "");
  const [voice,    setVoice]    = useState(settings?.brand_voice    ?? "");
  const [savingVoice, setSavingVoice] = useState(false);

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function saveProfile() {
    setSavingProfile(true);
    // name + email are platform-managed (read-only here, enforced by the
    // protect_tenant_admin_fields trigger) — deliberately not sent.
    const { error } = await db.from("tenants").update({
      contact_name: contactName.trim() || null,
      phone:        phone.trim()       || null,
      address:      address.trim()     || null,
    }).eq("id", tenantId);

    // The company-wide tax rate lives in tenant_settings (applied to all quotes).
    const parsedTax = taxRate !== "" ? parseFloat(taxRate) / 100 : null;
    const { error: taxError } = await db
      .from("tenant_settings")
      .upsert({ tenant_id: tenantId, default_tax_rate: parsedTax }, { onConflict: "tenant_id" });

    setSavingProfile(false);
    if (error || taxError) {
      // Surface the real cause (e.g. a missing column / RLS) instead of hiding it.
      console.error("[Company Settings] save failed:", error ?? taxError);
      toast.error(`Failed to save company settings: ${(error ?? taxError)?.message ?? "unknown error"}`);
    } else {
      toast.success("Company settings saved");
    }
  }

  async function saveDefaults() {
    const parsedDays = parseInt(validDays) || 30;
    const prefixClean = prefix.trim().toUpperCase() || "QUOTE";

    setSavingDefaults(true);
    const { error } = await db.from("tenant_settings").upsert({
      tenant_id:             tenantId,
      quote_number_prefix:   prefixClean,
      default_valid_days:    parsedDays,
      default_payment_terms: paymentTerms.trim() || "Net 30",
      default_font:          font,
    }, { onConflict: "tenant_id" });
    setSavingDefaults(false);
    if (error) toast.error("Failed to save quote defaults");
    else toast.success("Quote defaults saved");

    // Sync display state (capitalised prefix)
    setPrefix(prefixClean);
  }

  async function saveBrandVoice() {
    setSavingVoice(true);
    const { error } = await db.from("tenant_settings").upsert({
      tenant_id:      tenantId,
      business_type:  bizType.trim()  || null,
      business_about: bizAbout.trim() || null,
      brand_voice:    voice.trim()    || null,
    }, { onConflict: "tenant_id" });
    setSavingVoice(false);
    if (error) toast.error("Failed to save proposal voice");
    else toast.success("Proposal voice saved");
  }

  // Platform-managed fields (Company Name / Contact Email) can change from the
  // /admin console in a different session, so poll the server to pick those up.
  // Skipped while the tab is hidden or a save/upload is in flight (avoid
  // refreshing mid-action). router.refresh() preserves typed-in field state.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || savingProfile || savingDefaults || savingVoice || uploadingLogo) return;
      router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router, savingProfile, savingDefaults, savingVoice, uploadingLogo]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {!isOwner && (
        <p className="rounded-md bg-muted/50 border px-4 py-2.5 text-sm text-muted-foreground">
          View only — company settings are managed by the tenant owner.
        </p>
      )}

      {/* ── Company Settings ── */}
      <SectionCard icon={<Building2 className="w-4 h-4" />} title="Company Settings">
        <fieldset disabled={!isOwner} className="contents">
        <div className="space-y-1">
          <label className="text-sm font-medium">Logo</label>
          <div className="flex items-center gap-4">
            <div className="h-16 w-32 shrink-0 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
              {logoPreview
                ? // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Company logo" className="max-h-full max-w-full object-contain" />
                : <span className="text-xs text-muted-foreground">No logo</span>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingLogo ? "Uploading…" : (logoUrl ? "Replace" : "Upload")}
              </button>
              {logoUrl && (
                <button
                  onClick={removeLogo}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Remove
                </button>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Appears on the first page of generated PDFs. PNG or SVG with a transparent background works best (max 2 MB).
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Company Name</label>
          <input
            value={name}
            readOnly
            className={`${inputCls()} bg-muted/50 cursor-not-allowed text-muted-foreground`}
            title="Managed by UltraQuote"
          />
          <p className="text-xs text-muted-foreground">Managed by UltraQuote — contact us to change.</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Contact Name</label>
          <input
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            className={inputCls()}
            placeholder="Jane Smith"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Contact Email</label>
            <input
              type="email"
              value={email}
              readOnly
              className={`${inputCls()} bg-muted/50 cursor-not-allowed text-muted-foreground`}
              title="Managed by UltraQuote"
            />
            <p className="text-xs text-muted-foreground">Managed by UltraQuote.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Phone</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className={inputCls()}
              placeholder="(510) 555-0100"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Address</label>
          <textarea
            value={address}
            onChange={e => setAddress(e.target.value)}
            rows={2}
            className={cn(inputCls(), "resize-none")}
            placeholder="123 Main St, City, CA 94000"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Tax Rate (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={taxRate}
            onChange={e => setTaxRate(e.target.value)}
            className={inputCls()}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">
            Your company tax rate — applied uniformly to taxable items on all quotes.
          </p>
        </div>

        {isOwner && (
          <div className="flex justify-end">
            <button
              onClick={saveProfile}
              disabled={savingProfile || !name.trim()}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {savingProfile ? "Saving…" : "Save Settings"}
            </button>
          </div>
        )}
        </fieldset>
      </SectionCard>

      {/* ── Quote Defaults ── */}
      <SectionCard icon={<SlidersHorizontal className="w-4 h-4" />} title="Quote Defaults">
        <fieldset disabled={!isOwner} className="contents">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Quote Number Prefix</label>
            <input
              value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase())}
              className={inputCls()}
              placeholder="QUOTE"
              maxLength={10}
            />
            <p className="text-xs text-muted-foreground">
              e.g. &quot;{prefix || "QUOTE"}-2026-001&quot;
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Default Valid Days</label>
            <input
              type="number"
              min="1"
              max="365"
              step="1"
              value={validDays}
              onChange={e => setValidDays(e.target.value)}
              className={inputCls()}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">Days until quote expires</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Default Payment Terms</label>
            <input
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
              className={inputCls()}
              placeholder="Net 30"
            />
            <p className="text-xs text-muted-foreground">Shown on generated quotes</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Proposal Font</label>
            <select
              value={font}
              onChange={e => setFont(e.target.value)}
              disabled={!isOwner}
              className={inputCls()}
            >
              <option value="sans">Sans-serif (Helvetica / Arial)</option>
              <option value="serif">Serif (Times New Roman)</option>
              <option value="mono">Monospace (Courier)</option>
            </select>
            <p className="text-xs text-muted-foreground">Font for the proposal PDF &amp; preview. Limited to fonts that render reliably in the PDF and the e-signature document.</p>
          </div>
        </div>

        {isOwner && (
          <div className="flex justify-end">
            <button
              onClick={saveDefaults}
              disabled={savingDefaults}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {savingDefaults ? "Saving…" : "Save Defaults"}
            </button>
          </div>
        )}
        </fieldset>
      </SectionCard>

      {/* ── Proposal Voice (AI brand profile) ── */}
      <SectionCard icon={<Megaphone className="w-4 h-4" />} title="Proposal Voice">
        <p className="text-sm text-muted-foreground -mt-1">
          Shapes how the AI drafts proposal content — your business identity and tone.
          Leave blank for a neutral professional voice.
        </p>
        <fieldset disabled={!isOwner} className="contents">
          <div className="space-y-1">
            <label className="text-sm font-medium">What your business does</label>
            <input
              value={bizType}
              onChange={e => setBizType(e.target.value)}
              className={inputCls()}
              maxLength={120}
              placeholder="e.g. Commercial security camera & access-control installer"
            />
            <p className="text-xs text-muted-foreground">One line — used as the author&apos;s role in AI drafts (replaces a generic default).</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">About your business</label>
            <textarea
              value={bizAbout}
              onChange={e => setBizAbout(e.target.value)}
              rows={3}
              maxLength={1000}
              className={cn(inputCls(), "resize-y")}
              placeholder="Differentiators the AI can draw on — e.g. licensed & insured, 12 years in the Bay Area, NDAA-compliant gear, 5-year warranty, in-house techs."
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Brand voice &amp; writing style</label>
            <textarea
              value={voice}
              onChange={e => setVoice(e.target.value)}
              rows={3}
              maxLength={500}
              className={cn(inputCls(), "resize-y")}
              placeholder="e.g. Warm and consultative; plain language, no jargon, no hype. One short paragraph per section. Don't address the client by name."
            />
            <p className="text-xs text-muted-foreground">
              Guides the AI&apos;s tone <em>and</em> style. You can control things like:
              formality (warm / formal / technical), length (one short paragraph vs. detailed),
              terseness, jargon, and whether to address the client by name. Defaults when blank:
              a neutral professional voice, one short paragraph per section, no client name.
            </p>
          </div>
          {isOwner && (
            <div className="flex justify-end">
              <button
                onClick={saveBrandVoice}
                disabled={savingVoice}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {savingVoice ? "Saving…" : "Save Voice"}
              </button>
            </div>
          )}
        </fieldset>
      </SectionCard>

      {isOwner && (
        <SectionCard icon={<FolderTree className="w-4 h-4" />} title="Product Categories">
          <CategoriesCard tenantId={tenantId} />
        </SectionCard>
      )}

    </div>
  );
}
