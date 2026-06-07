"use client";

import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useTenantId } from "@/lib/supabase/use-tenant";
import { useToast } from "@/components/ui/toast";
import type { Client } from "@/types";

interface Props {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}

type FieldErrors = {
  companyName:  string | null;
  contactName:  string | null;
  contactEmail: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClientDrawer({ open, client, onClose, onSaved }: Props) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const tenantId = useTenantId();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ companyName: null, contactName: null, contactEmail: null });

  const [companyName,  setCompanyName]  = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address,      setAddress]      = useState("");
  const [notes,        setNotes]        = useState("");
  const [isActive,     setIsActive]     = useState(true);

  // Reset form when drawer opens/closes or switches between add/edit
  useEffect(() => {
    if (client) {
      setCompanyName(client.company_name);
      setContactName(client.contact_name ?? "");
      setContactEmail(client.contact_email ?? "");
      setContactPhone(client.contact_phone ?? "");
      setAddress(client.address ?? "");
      setNotes(client.notes ?? "");
      setIsActive(client.is_active);
    } else {
      setCompanyName(""); setContactName(""); setContactEmail("");
      setContactPhone(""); setAddress(""); setNotes(""); setIsActive(true);
    }
    setFieldErrors({ companyName: null, contactName: null, contactEmail: null });
  }, [client, open]);

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

  // ── Save ──────────────────────────────────────────────────────────────────

  const hasErrors = Object.values(fieldErrors).some(Boolean);
  const requiredFilled = companyName.trim() && contactName.trim() && contactEmail.trim();

  async function handleSave() {
    // Run all three validations before saving
    await Promise.all([validateCompanyName(), validateContactName(), validateContactEmail()]);
    // Re-read state after async — re-check via fresh query
    if (hasErrors || !requiredFilled) return;

    setSaving(true);
    try {
      const payload = {
        company_name:  companyName.trim(),
        contact_name:  contactName.trim(),
        contact_email: contactEmail.trim().toLowerCase(),
        contact_phone: contactPhone || null,
        address:       address || null,
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
          <h2 className="text-lg font-semibold">{client ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

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

          {/* Address */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className={cn(inputCls(false), "resize-none")}
              placeholder="123 Main St, City, CA 94000"
            />
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t shrink-0">
          {client && (
            <button onClick={handleDeactivate} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {client.is_active ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !requiredFilled || hasErrors}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : client ? "Save Changes" : "Add Client"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
