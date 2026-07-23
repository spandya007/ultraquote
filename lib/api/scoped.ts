import { createAdminClient } from "@/lib/supabase/admin";

// Tenant-scoped query surface for the public API. API-key requests are NOT a
// Supabase auth session, so **RLS does not apply** — the service-role client sees
// every tenant's rows. This wrapper makes the mandatory `tenant_id` filter the
// default path so an endpoint can't accidentally leak across tenants (the #1
// correctness rule — docs §3.2).
//
// Top-level tenant-owned tables (quotes, clients, products, tenant_webhooks) go
// through select/insertOne/updateById/deleteById, which always pin tenant_id.
// Child tables without a tenant_id column (quote_scenarios, quote_line_items) are
// reached via `child()` — ONLY after their parent quote has been tenant-verified,
// then filtered by the parent's id (quote_id / scenario_id).
export class ScopedDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly admin: any;
  constructor(readonly tenantId: string) {
    this.admin = createAdminClient();
  }

  // Read a tenant-owned table — tenant filter pre-applied; chain more filters.
  select(table: string, cols = "*") {
    return this.admin.from(table).select(cols).eq("tenant_id", this.tenantId);
  }

  // Insert into a tenant-owned table; tenant_id is injected (any caller-supplied
  // tenant_id is overwritten) so a payload can't target another tenant.
  insertOne(table: string, row: Record<string, unknown>) {
    return this.admin.from(table).insert({ ...row, tenant_id: this.tenantId }).select().single();
  }

  updateById(table: string, id: string, patch: Record<string, unknown>) {
    return this.admin.from(table).update(patch).eq("id", id).eq("tenant_id", this.tenantId);
  }

  deleteById(table: string, id: string) {
    return this.admin.from(table).delete().eq("id", id).eq("tenant_id", this.tenantId);
  }

  // Raw builder for a child table with no tenant_id column. Use ONLY after the
  // owning quote was fetched via select() (which proved tenancy), then filter by
  // the parent id.
  child(table: string) {
    return this.admin.from(table);
  }
}
