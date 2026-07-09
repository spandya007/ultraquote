"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, Upload, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useTenantId } from "@/lib/supabase/use-tenant";
import { useToast } from "@/components/ui/toast";
import type { Client } from "@/types";

interface Props {
  /** View-only mode: members can view (and add new) clients, but only the
   *  tenant owner edits existing ones. */
  readOnly?: boolean;
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}

type FieldErrors = {
  companyName:  string | null;
  contactName:  string | null;
  contactEmail: string | null;
  secondaryEmail: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORAGE_SCHEME = "sb-storage://";

export function ClientDrawer({ open, client, onClose, onSaved, readOnly }: Props) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const tenantId = useTenantId();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ companyName: null, contactName: null, contactEmail: null, secondaryEmail: null });

  const [companyName,  setCompanyName]  = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // Secondary contact (second signer / point of contact)
  const [secondaryName,  setSecondaryName]  = useState("");
  const [secondaryEmail, setSecondaryEmail] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  // Structured address (6 fields). Legacy free-text kept as a fallback.
  const [addrStreet,  setAddrStreet]  = useState("");
  const [addrSuite,   setAddrSuite]   = useState("");
  const [addrCity,    setAddrCity]    = useState("");
  const [addrState,   setAddrState]   = useState("");
  const [addrPostal,  setAddrPostal]  = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [legacyAddress, setLegacyAddress] = useState<string | null>(null);
  const [notes,        setNotes]        = useState("");
  const [isActive,     setIsActive]     = useState(true);
  const [logoUrl,      setLogoUrl]      = useState<string | null>(null);
  const [logoPreview,  setLogoPreview]  = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Reset form when drawer opens/closes or switches between add/edit
  useEffect(() => {
    if (client) {
      setCompanyName(client.company_name);
      setContactName(client.contact_name ?? "");
      setContactEmail(client.contact_email ?? "");
      setContactPhone(client.contact_phone ?? "");
      setSecondaryName(client.secondary_contact_name ?? "");
      setSecondaryEmail(client.secondary_contact_email ?? "");
      setSecondaryPhone(client.secondary_contact_phone ?? "");
      setAddrStreet(client.address_street ?? "");
      setAddrSuite(client.address_suite ?? "");
      setAddrCity(client.address_city ?? "");
      setAddrState(client.address_state ?? "");
      setAddrPostal(client.address_postal ?? "");
      setAddrCountry(client.address_country ?? "");
      setLegacyAddress(client.address ?? null);
      setNotes(client.notes ?? "");
      setIsActive(client.is_active);
      setLogoUrl(client.logo_url ?? null);
    } else {
      setCompanyName(""); setContactName(""); setContactEmail(""); setContactPhone("");
      setSecondaryName(""); setSecondaryEmail(""); setSecondaryPhone("");
      setAddrStreet(""); setAddrSuite(""); setAddrCity(""); setAddrState(""); setAddrPostal(""); setAddrCountry("");
      setLegacyAddress(null); setNotes(""); setIsActive(true);
      setLogoUrl(null);
    }
    setFieldErrors({ companyName: null, contactName: null, contactEmail: null, secondaryEmail: null });
  }, [client, open]);

  // Resolve the stored sb-storage:// logo to a signed URL for preview.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!logoUrl) { setLogoPreview(null); return; }
      if (logoUrl.startsWith(STORAGE_SCHEME)) {
        const rest = logoUrl.slice(STORAGE_SCHEME.length);
        const slash = rest.indexOf("/");
        const { data } = await supabase.storage.from(rest.slice(0, slash)).createSignedUrl(rest.slice(slash + 1), 3600);
        if (active) setLogoPreview(data?.signedUrl ?? null);
      } else if (active) setLogoPreview(logoUrl);
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoUrl]);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2 MB"); return; }
    if (!tenantId) { toast.error("Still loading — try again in a moment"); return; }
    setUploadingLogo(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `client-logos/${tenantId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("proposal-assets").upload(path, file, { upsert: true, contentType: file.type });
    setUploadingLogo(false);
    if (error) { toast.error(`Upload failed: ${error.message}`); return; }
    setLogoUrl(`${STORAGE_SCHEME}proposal-assets/${path}`);
  }

  // ── Fetch all existing clients once for duplicate checks ──────────────────
  const getOthers = useCallback(async () => {
    const { data } = await db
      .from("clients")
      .select("id, company_name, contact_name, contact_email") as {
        data: { id: string; company_name: string; contact_name: string | null; contact_email: string | null }[] | null
      };
    // Exclude the record being edited from duplicate checks
    return (data ?? []).filter(c => c.id !== client?.id);
  }, [db, client]);

  // ── Per-field blur handlers ───────────────────────────────────────────────

  async function validateCompanyName() {
    const val = companyName.trim();
    if (!val) {
      setFieldErrors(e => ({ ...e, companyName: "Company name is required" }));
      return;
    }
    const others = await getOthers();
    const dup = others.find(c => c.company_name.toLowerCase() === val.toLowerCase());
    setFieldErrors(e => ({
      ...e,
      companyName: dup ? `"${dup.company_name}" is already an existing client.` : null,
    }));
  }

  async function validateContactName() {
    const val = contactName.trim();
    if (!val) {
      setFieldErrors(e => ({ ...e, contactName: "Contact name is required" }));
      return;
    }
    // Only a duplicate if the same name exists at the same company
    const others = await getOthers();
    const dup = others.find(
      c =>
        c.contact_name?.toLowerCase() === val.toLowerCase() &&
        c.company_name.toLowerCase() === companyName.trim().toLowerCase()
    );
    setFieldErrors(e => ({
      ...e,
      contactName: dup ? `"${dup.contact_name}" is already a contact at ${dup.company_name}.` : null,
    }));
  }

  async function validateContactEmail() {
    const val = contactEmail.trim().toLowerCase();
    if (!val) {
      setFieldErrors(e => ({ ...e, contactEmail: "Contact email is required" }));
      return;
    }
    if (!EMAIL_RE.test(val)) {
      setFieldErrors(e => ({ ...e, contactEmail: "Please enter a valid email address" }));
      return;
    }
    const others = await getOthers();
    const dup = others.find(c => c.contact_email?.toLowerCase() === val);
    setFieldErrors(e => ({
      ...e,
      contactEmail: dup ? `"${val}" is already used by ${dup.company_name}.` : null,
    }));
  }

  // Secondary email is optional; only validate its format when provided.
  function validateSecondaryEmail() {
    const val = secondaryEmail.trim().toLowerCase();
    setFieldErrors(e => ({
      ...e,
      secondaryEmail: val && !EMAIL_RE.test(val) ? "Please enter a valid email address" : null,
    }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const hasErrors = Object.values(fieldErrors).some(Boolean);
  const requiredFilled = companyName.trim() && contactName.trim() && contactEmail.trim();

  async function handleSave() {
    // Run validations before saving
    await Promise.all([validateCompanyName(), validateContactName(), validateContactEmail()]);
    validateSecondaryEmail();
    // Re-read state after async — re-check via fresh query
    if (hasErrors || !requiredFilled) return;

    setSaving(true);
    try {
      // Note: the legacy free-text `address` is intentionally NOT written here —
      // it's preserved as a fallback for older records (proposals compose the
      // structured fields when present, else fall back to `address`).
      const payload = {
        company_name:  companyName.trim(),
        contact_name:  contactName.trim(),
        contact_email: contactEmail.trim().toLowerCase(),
        contact_phone: contactPhone || null,
        secondary_contact_name:  secondaryName.trim() || null,
        secondary_contact_email: secondaryEmail.trim().toLowerCase() || null,
        secondary_contact_phone: secondaryPhone.trim() || null,
        address_street:  addrStreet.trim()  || null,
        address_suite:   addrSuite.trim()   || null,
        address_city:    addrCity.trim()    || null,
        address_state:   addrState.trim()   || null,
        address_postal:  addrPostal.trim()  || null,
        address_country: addrCountry.trim() || null,
        logo_url:      logoUrl,
        notes:         notes || null,
        is_active:     isActive,
      };

      if (client) {
        const { error: e } = await db.from("clients").update(payload).eq("id", client.id);
        if (e) throw e;
        toast.success("Client updated successfully");
      } else {
        const { error: e } = await db.from("clients").insert({ ...payload, tenant_id: tenantId });
        if (e) throw e;
        toast.success(`${payload.company_name} added as a client`);
      }
      onSaved();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!client) return;
    await db.from("clients").update({ is_active: !client.is_active }).eq("id", client.id);
    toast.success(client.is_active ? `${client.company_name} deactivated` : `${client.company_name} reactivated`);
    onSaved();
  }

  if (!open) return null;

  // ── Shared input class helper ─────────────────────────────────────────────
  function inputCls(hasError: boolean) {
    return cn(
      "w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2",
      hasError
        ? "border-destructive focus:ring-destructive/40"
        : "focus:ring-ring"
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-background border-l shadow-xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">{readOnly ? "Client Details" : client ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        {/* Body (fieldset natively disables all nested controls in view-only mode) */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
        <fieldset disabled={readOnly} className="space-y-4 block min-w-0 border-0 m-0 p-0">

          {/* Company Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Company Name *</label>
            <input
              value={companyName}
              onChange={(e) => { setCompanyName(e.target.value); setFieldErrors(fe => ({ ...fe, companyName: null })); }}
              onBlur={validateCompanyName}
              className={inputCls(!!fieldErrors.companyName)}
              placeholder="Acme Corp"
            />
            {fieldErrors.companyName && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.companyName}</p>
            )}
          </div>

          {/* Contact Name + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Contact Name *</label>
              <input
                value={contactName}
                onChange={(e) => { setContactName(e.target.value); setFieldErrors(fe => ({ ...fe, contactName: null })); }}
                onBlur={validateContactName}
                className={inputCls(!!fieldErrors.contactName)}
                placeholder="Jane Smith"
              />
              {fieldErrors.contactName && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.contactName}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Phone</label>
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={inputCls(false)}
                placeholder="(510) 555-0100"
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Email *</label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => { setContactEmail(e.target.value); setFieldErrors(fe => ({ ...fe, contactEmail: null })); }}
              onBlur={validateContactEmail}
              className={inputCls(!!fieldErrors.contactEmail)}
              placeholder="jane@acmecorp.com"
            />
            {fieldErrors.contactEmail && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.contactEmail}</p>
            )}
          </div>

          {/* Secondary contact (second signer / point of contact) */}
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Secondary Contact</label>
              <span className="text-xs text-muted-foreground">Optional — e.g. a second signer</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input
                  value={secondaryName}
                  onChange={(e) => setSecondaryName(e.target.value)}
                  className={inputCls(false)}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <input
                  value={secondaryPhone}
                  onChange={(e) => setSecondaryPhone(e.target.value)}
                  className={inputCls(false)}
                  placeholder="(510) 555-0101"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={secondaryEmail}
                onChange={(e) => { setSecondaryEmail(e.target.value); setFieldErrors(fe => ({ ...fe, secondaryEmail: null })); }}
                onBlur={validateSecondaryEmail}
                className={inputCls(!!fieldErrors.secondaryEmail)}
                placeholder="john@acmecorp.com"
              />
              {fieldErrors.secondaryEmail && (
                <p className="text-xs text-destructive mt-1">{fieldErrors.secondaryEmail}</p>
              )}
            </div>
          </div>

          {/* Address (structured) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Address</label>
            {legacyAddress && !(addrStreet || addrCity || addrState || addrPostal || addrCountry || addrSuite) && (
              <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-2 py-1.5">
                Current address on file: <span className="text-foreground">{legacyAddress}</span>. Fill the fields below to replace it.
              </p>
            )}
            <input
              value={addrStreet}
              onChange={(e) => setAddrStreet(e.target.value)}
              className={inputCls(false)}
              placeholder="Street address (e.g. 123 Main St)"
            />
            <input
              value={addrSuite}
              onChange={(e) => setAddrSuite(e.target.value)}
              className={inputCls(false)}
              placeholder="Suite / Unit (optional)"
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                value={addrCity}
                onChange={(e) => setAddrCity(e.target.value)}
                className={inputCls(false)}
                placeholder="City"
              />
              <input
                value={addrState}
                onChange={(e) => setAddrState(e.target.value)}
                className={inputCls(false)}
                placeholder="State / Province"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input
                value={addrPostal}
                onChange={(e) => setAddrPostal(e.target.value)}
                className={inputCls(false)}
                placeholder="ZIP / Postal code"
              />
              <input
                value={addrCountry}
                onChange={(e) => setAddrCountry(e.target.value)}
                className={inputCls(false)}
                placeholder="Country"
              />
            </div>
          </div>

          {/* Logo */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Logo</label>
            <div className="flex items-center gap-4">
              <div className="h-14 w-28 shrink-0 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                {logoPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoPreview} alt="Client logo" className="max-h-full max-w-full object-contain" />
                  : <span className="text-xs text-muted-foreground">No logo</span>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploadingLogo ? "Uploading…" : (logoUrl ? "Replace" : "Upload")}
                </button>
                {logoUrl && (
                  <button type="button" onClick={() => setLogoUrl(null)} disabled={uploadingLogo}
                    className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive hover:bg-muted disabled:opacity-50 transition-colors">
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
              Usable in proposals via the <strong>Insert Field → Logo</strong> token.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={cn(inputCls(false), "resize-none")}
              placeholder="Internal notes about this client…"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border" />
            Active client
          </label>
        </fieldset>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t shrink-0">
          {readOnly && (
            <span className="text-xs text-muted-foreground">
              View only — existing clients are edited by the tenant owner.
            </span>
          )}
          {!readOnly && client && (
            <button onClick={handleDeactivate} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {client.is_active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                onClick={handleSave}
                disabled={saving || !requiredFilled || hasErrors}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : client ? "Save Changes" : "Add Client"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
