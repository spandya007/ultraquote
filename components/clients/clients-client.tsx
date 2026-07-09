"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Plus, Search, Building2, Mail, Phone, MoreHorizontal, Upload, Download, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Client } from "@/types";
import { ClientDrawer } from "./client-drawer";

interface Props {
  initialClients: Client[];
  /** Tenant owner edits existing clients; members may only view + add new. */
  isOwner: boolean;
}

export function ClientsClient({ initialClients, isOwner }: Props) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"active" | "inactive" | "all">("active");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Resolve each client's sb-storage:// logo to a signed URL for the cards.
  useEffect(() => {
    let active = true;
    const SCHEME = "sb-storage://";
    (async () => {
      const entries = await Promise.all(
        clients
          .filter(c => c.logo_url?.startsWith(SCHEME))
          .map(async (c) => {
            const rest = (c.logo_url as string).slice(SCHEME.length);
            const slash = rest.indexOf("/");
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase as any).storage
              .from(rest.slice(0, slash)).createSignedUrl(rest.slice(slash + 1), 3600);
            return [c.id, data?.signedUrl] as [string, string | undefined];
          })
      );
      if (!active) return;
      const map: Record<string, string> = {};
      for (const [id, signed] of entries) if (signed) map[id] = signed;
      setLogoMap(map);
    })();
    return () => { active = false; };
  }, [clients, supabase]);

  const refreshClients = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("clients").select("*").order("company_name");
    if (data) setClients(data);
  }, [supabase]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (filterActive === "active" && !c.is_active) return false;
      if (filterActive === "inactive" && c.is_active) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.company_name.toLowerCase().includes(q) ||
          (c.contact_name ?? "").toLowerCase().includes(q) ||
          (c.contact_email ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [clients, search, filterActive]);

  function openDrawer(client: Client | null) {
    setSelectedClient(client);
    setDrawerOpen(true);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/clients/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ imported: 0, updated: 0, skipped: 0, errors: [data.error || "Import failed"] });
      } else {
        setImportResult(data);
        if ((data.imported ?? 0) > 0 || (data.updated ?? 0) > 0) refreshClients();
      }
    } catch {
      setImportResult({ imported: 0, updated: 0, skipped: 0, errors: ["Network error during import"] });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} of {clients.length} clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <>
              {/* CSV format help + sample template */}
              <div className="relative">
                <button
                  onClick={() => setShowFormat((v) => !v)}
                  title="What columns does the import expect?"
                  className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                  CSV format
                </button>
                {showFormat && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowFormat(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 w-80 rounded-lg border bg-background p-4 text-sm shadow-xl">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold">Client CSV format</p>
                        <button onClick={() => setShowFormat(false)} className="p-0.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
                      </div>
                      <p className="text-muted-foreground">Only <span className="font-medium text-foreground">Company Name</span> is required. Everything else is optional.</p>
                      <ul className="mt-2 space-y-1 text-muted-foreground list-disc pl-4">
                        <li>Contact + Secondary Contact (name / email / phone)</li>
                        <li>Address: Street, Suite, City, State, ZIP, Country</li>
                        <li>Common CRM header spellings are recognized automatically</li>
                        <li>Re-importing matches by <span className="font-medium text-foreground">Company Name</span> and updates in place</li>
                      </ul>
                      <a
                        href="/client-import-template.csv"
                        download
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download sample CSV
                      </a>
                    </div>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                {importing ? "Importing…" : "Import CSV"}
              </button>
            </>
          )}
          <button
            onClick={() => openDrawer(null)}
            className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Client
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={cn(
          "mb-4 rounded-md px-4 py-3 text-sm flex items-start justify-between gap-3",
          importResult.errors.length > 0
            ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300"
            : "bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-300"
        )}>
          <div>
            <p className="font-medium">
              Import complete — {importResult.imported} added, {importResult.updated} updated
              {importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                {importResult.errors.length > 5 && <li>…and {importResult.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="p-0.5 rounded hover:bg-black/5"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Grid of client cards */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {clients.length === 0
              ? "No clients yet — add your first client to get started."
              : "No clients match your search."}
          </p>
          {clients.length === 0 && (
            <button
              onClick={() => openDrawer(null)}
              className="mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Add Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <div
              key={client.id}
              onClick={() => openDrawer(client)}
              className="group rounded-lg border bg-card p-5 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
            >
              {logoMap[client.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <div className="-mx-5 -mt-5 mb-4 h-16 px-5 flex items-center justify-center bg-muted/20 border-b rounded-t-lg">
                  <img
                    src={logoMap[client.id]}
                    alt={client.company_name}
                    className="max-h-10 max-w-[75%] object-contain"
                  />
                </div>
              )}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {!logoMap[client.id] && (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                      {client.company_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold leading-tight">{client.company_name}</p>
                    {client.contact_name && (
                      <p className="text-xs text-muted-foreground">{client.contact_name}</p>
                    )}
                  </div>
                </div>
                <span className={cn(
                  "text-xs rounded-full px-2 py-0.5 font-medium",
                  client.is_active
                    ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                )}>
                  {client.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground">
                {client.contact_email && (
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{client.contact_email}</span>
                  </div>
                )}
                {client.contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{client.contact_phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Added {formatDate(client.created_at)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); openDrawer(client); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-all"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ClientDrawer
        open={drawerOpen}
        client={selectedClient}
        readOnly={!isOwner && selectedClient !== null}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); refreshClients(); }}
      />
    </>
  );
}
