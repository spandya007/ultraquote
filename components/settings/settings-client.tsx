"use client";

import { useState, useEffect, useRef } from "react";
import { Building2, SlidersHorizontal, Upload, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

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
  const [name,        setName]        = useState(tenant?.name         ?? "");
  const [contactName, setContactName] = useState(tenant?.contact_name ?? "");
  const [email,       setEmail]       = useState(tenant?.email        ?? "");
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
  const [savingDefaults, setSavingDefaults] = useState(false);

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function saveProfile() {
    if (!name.trim()) { toast.error("Company name is required"); return; }
    setSavingProfile(true);
    const { error } = await db.from("tenants").update({
      name:         name.trim(),
      contact_name: contactName.trim() || null,
      email:        email.trim()       || null,
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
    }, { onConflict: "tenant_id" });
    setSavingDefaults(false);
    if (error) toast.error("Failed to save quote defaults");
    else toast.success("Quote defaults saved");

    // Sync display state (capitalised prefix)
    setPrefix(prefixClean);
  }

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
          <label className="text-sm font-medium">Company Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className={inputCls(!name.trim())}
            placeholder="Acme MSP"
          />
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
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputCls()}
              placeholder="hello@acmemsp.com"
            />
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

    </div>
  );
}
