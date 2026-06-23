import { AlertTriangle, FileText, ShieldAlert, Package, Download } from "lucide-react";
import type { TenantDossier, DossierQuote } from "@/lib/admin/tenant-dossier";
import { formatCurrency } from "@/lib/utils/format";
import { STATUS_STYLES } from "@/lib/quote-status";
import { cn } from "@/lib/utils/cn";

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[status as keyof typeof STATUS_STYLES] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

function QuoteTable({ quotes }: { quotes: DossierQuote[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Quote</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium text-right">Value</th>
            <th className="px-3 py-2 font-medium">Valid until</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                <div className="font-mono text-xs">{q.quote_number}</div>
                {q.title && <div className="text-xs text-muted-foreground">{q.title}</div>}
              </td>
              <td className="px-3 py-2">{q.client_name ?? "—"}</td>
              <td className="px-3 py-2"><StatusPill status={q.effective_status} /></td>
              <td className="px-3 py-2 text-right tabular-nums">{q.value != null ? formatCurrency(q.value) : "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(q.valid_until)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className={cn("rounded-md p-3", warn ? "bg-amber-50 dark:bg-amber-500/10" : "bg-muted/40")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", warn && "text-amber-700 dark:text-amber-300")}>{value}</div>
    </div>
  );
}

export function TenantDossierView({ dossier, tenantId }: { dossier: TenantDossier; tenantId: string }) {
  const { tenant, owner, counts, flagged } = dossier;

  const risks: { tone: "danger" | "warning" | "info"; text: string }[] = [];
  if (flagged.signedQuotes.length)
    risks.push({ tone: "danger", text: `${flagged.signedQuotes.length} signed quote(s) — executed contracts that will be permanently destroyed.` });
  if (flagged.inFlightQuotes.length)
    risks.push({ tone: "warning", text: `${flagged.inFlightQuotes.length} quote(s) sent and awaiting client signature.` });
  if (counts.signatureSessionsOpen)
    risks.push({ tone: "warning", text: `${counts.signatureSessionsOpen} open signature session(s) in progress.` });
  if (counts.productsActive)
    risks.push({ tone: "info", text: `${counts.productsActive} active catalog product(s) the tenant may want to keep.` });

  const toneCls = {
    danger: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30",
    warning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
    info: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">
            Owner: {owner ? `${owner.full_name ?? "—"} · ${owner.email}` : "No owner"} · Created {fmtDate(tenant.created_at)}
            {tenant.subscription_end ? ` · Subscription ends ${fmtDate(tenant.subscription_end)}` : " · Unlimited subscription"}
            {!tenant.platform_enabled && " · SUSPENDED"}
          </p>
        </div>
        <a
          href={`/admin/tenants/${tenantId}/report`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Download className="w-4 h-4" /> Download report
        </a>
      </div>

      {/* Risk banner */}
      {risks.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Before deleting — review what will be lost
          </div>
          <ul className="space-y-1.5">
            {risks.map((r, i) => (
              <li key={i} className={cn("rounded-md border px-3 py-1.5 text-sm", toneCls[r.tone])}>{r.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Counts */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-semibold text-base">Workspace contents</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <Stat label="Clients" value={counts.clients} />
          <Stat label="Products (active)" value={`${counts.products} (${counts.productsActive})`} />
          <Stat label="Templates" value={counts.templates} />
          <Stat label="Quotes" value={counts.quotesTotal} />
          <Stat label="Signed quotes" value={flagged.signedQuotes.length} warn={flagged.signedQuotes.length > 0} />
          <Stat label="In-flight quotes" value={flagged.inFlightQuotes.length} warn={flagged.inFlightQuotes.length > 0} />
          <Stat label="Open signing sessions" value={counts.signatureSessionsOpen} warn={counts.signatureSessionsOpen > 0} />
          <Stat label="Team members" value={dossier.users.length} />
        </div>
      </section>

      {/* Flagged: signed */}
      {flagged.signedQuotes.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-base">
            <ShieldAlert className="w-4 h-4 text-red-600" /> Signed quotes (executed contracts)
          </h2>
          <QuoteTable quotes={flagged.signedQuotes} />
        </section>
      )}

      {/* Flagged: in-flight */}
      {flagged.inFlightQuotes.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-base">
            <FileText className="w-4 h-4 text-amber-600" /> In-flight quotes (sent / viewed)
          </h2>
          <QuoteTable quotes={flagged.inFlightQuotes} />
        </section>
      )}

      {/* Flagged: active products */}
      {flagged.activeProducts.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-base">
            <Package className="w-4 h-4 text-blue-600" /> Active catalog products ({flagged.activeProducts.length})
          </h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {flagged.activeProducts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.category ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.item_type ?? "—"}{p.billing_period ? ` · ${p.billing_period}` : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.unit_price != null ? formatCurrency(p.unit_price) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Deletion manifest */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold text-base">What a deletion would remove</h2>
        <p className="mb-3 text-sm text-muted-foreground">Every row below, plus the tenant&apos;s Auth logins and stored files, are permanently deleted.</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {[
            ["Clients", counts.clients],
            ["Products", counts.products],
            ["Pricing tiers", counts.productPricingTiers],
            ["Product categories", counts.productCategories],
            ["Product audit rows", counts.productAudit],
            ["Templates", counts.templates],
            ["Quotes", counts.quotesTotal],
            ["Quote scenarios", counts.quoteScenarios],
            ["Line items", counts.quoteLineItems],
            ["Signers", counts.quoteSigners],
            ["Signature sessions", counts.signatureSessions],
            ["Team members (logins)", dossier.users.length],
            ["Stored logo files", counts.storageLogoFiles],
          ].map(([label, n]) => (
            <div key={label as string} className="flex justify-between border-b border-dashed py-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums font-medium">{n as number}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
