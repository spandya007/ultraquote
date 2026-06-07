"use client";

import { useState } from "react";
import { Building2, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

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

export function SettingsClient({ tenantId, tenant, settings }: Props) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const toast = useToast();

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
    setSavingProfile(false);
    if (error) toast.error("Failed to save profile");
    else toast.success("Company profile saved");
  }

  async function saveDefaults() {
    const parsedTax = taxRate !== "" ? parseFloat(taxRate) / 100 : null;
    const parsedDays = parseInt(validDays) || 30;
    const prefixClean = prefix.trim().toUpperCase() || "QUOTE";

    setSavingDefaults(true);

    if (settings) {
      // Update existing row
      const { error } = await db.from("tenant_settings").update({
        quote_number_prefix:  prefixClean,
        default_tax_rate:     parsedTax,
        default_valid_days:   parsedDays,
        default_payment_terms: paymentTerms.trim() || "Net 30",
      }).eq("tenant_id", tenantId);
      setSavingDefaults(false);
      if (error) toast.error("Failed to save quote defaults");
      else toast.success("Quote defaults saved");
    } else {
      // Create settings row for the first time
      const { error } = await db.from("tenant_settings").insert({
        tenant_id:             tenantId,
        quote_number_prefix:   prefixClean,
        default_tax_rate:      parsedTax,
        default_valid_days:    parsedDays,
        default_payment_terms: paymentTerms.trim() || "Net 30",
      });
      setSavingDefaults(false);
      if (error) toast.error("Failed to save quote defaults");
      else toast.success("Quote defaults saved");
    }

    // Sync display state (capitalised prefix)
    setPrefix(prefixClean);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Company Profile ── */}
      <SectionCard icon={<Building2 className="w-4 h-4" />} title="Company Profile">
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

        <div className="flex justify-end">
          <button
            onClick={saveProfile}
            disabled={savingProfile || !name.trim()}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {savingProfile ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </SectionCard>

      {/* ── Quote Defaults ── */}
      <SectionCard icon={<SlidersHorizontal className="w-4 h-4" />} title="Quote Defaults">
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
            <label className="text-sm font-medium">Default Tax Rate (%)</label>
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
            <p className="text-xs text-muted-foreground">Applied to taxable line items</p>
          </div>
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

        <div className="flex justify-end">
          <button
            onClick={saveDefaults}
            disabled={savingDefaults}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {savingDefaults ? "Saving…" : "Save Defaults"}
          </button>
        </div>
      </SectionCard>

    </div>
  );
}
