import crypto from "crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared, mutable mock state for the admin client (configured per test).
const state = vi.hoisted(() => ({
  keyRow: null as null | Record<string, unknown>,
  rows: [] as unknown[],
  single: null as null | Record<string, unknown>,
  rpcCount: 1,
}));

vi.mock("@/lib/supabase/admin", () => {
  function makeBuilder(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = { _table: table, _eq: [] as [string, unknown][] };
    b.select = () => b;
    b.insert = (row: unknown) => { b._insert = row; return b; };
    b.update = (p: unknown) => { b._update = p; return b; };
    b.delete = () => { b._delete = true; return b; };
    b.eq = (c: string, v: unknown) => { b._eq.push([c, v]); return b; };
    b.in = () => b; b.gte = () => b; b.is = () => b; b.order = () => b; b.range = () => b;
    b.maybeSingle = () =>
      Promise.resolve({ data: table === "tenant_api_keys" ? state.keyRow : state.single, error: null });
    b.single = () => Promise.resolve({ data: b._insert ?? state.single, error: null });
    b.then = (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: state.rows, error: null });
    return b;
  }
  return {
    createAdminClient: () => ({
      from: (t: string) => makeBuilder(t),
      rpc: () => Promise.resolve({ data: state.rpcCount, error: null }),
    }),
  };
});

import { generateApiKey, hashApiKey, authenticateApiKey, KEY_PREFIX } from "./keys";
import { ScopedDb } from "./scoped";
import { enforceRateLimit } from "./ratelimit";
import { serializeProposalDetail, serializeProduct } from "./serialize";

beforeEach(() => {
  state.keyRow = null; state.rows = []; state.single = null; state.rpcCount = 1;
});

describe("keys.generateApiKey / hashApiKey", () => {
  it("mints an sp_live_ key whose prefix matches and hash is sha256(full)", () => {
    const { full, prefix, hash } = generateApiKey();
    expect(full.startsWith(KEY_PREFIX)).toBe(true);
    expect(prefix.startsWith(KEY_PREFIX)).toBe(true);
    expect(full.startsWith(prefix)).toBe(true);
    expect(hash).toBe(crypto.createHash("sha256").update(full).digest("hex"));
  });
  it("hashApiKey is deterministic", () => {
    expect(hashApiKey("sp_live_abc")).toBe(hashApiKey("sp_live_abc"));
  });
});

describe("keys.authenticateApiKey", () => {
  const reqWith = (auth?: string) =>
    new Request("https://x/api/v1/proposals", auth ? { headers: { authorization: auth } } : undefined);

  it("401s a missing or malformed key without touching the DB", async () => {
    expect("response" in (await authenticateApiKey(reqWith()))).toBe(true);
    expect("response" in (await authenticateApiKey(reqWith("Bearer nope")))).toBe(true);
    expect("response" in (await authenticateApiKey(reqWith("Basic x")))).toBe(true);
  });

  it("401s a revoked key", async () => {
    state.keyRow = { id: "k1", tenant_id: "t1", scopes: ["read"], revoked_at: "2026-01-01", last_used_at: null };
    const r = await authenticateApiKey(reqWith(`Bearer ${KEY_PREFIX}deadbeef`));
    expect("response" in r).toBe(true);
  });

  it("resolves tenant + scopes for a valid key", async () => {
    state.keyRow = { id: "k1", tenant_id: "t1", scopes: ["read", "write"], revoked_at: null, last_used_at: new Date().toISOString() };
    const r = await authenticateApiKey(reqWith(`Bearer ${KEY_PREFIX}deadbeef`));
    expect(r).toMatchObject({ tenantId: "t1", scopes: ["read", "write"], keyId: "k1" });
  });
});

describe("scoped.ScopedDb — mandatory tenant filter (isolation)", () => {
  it("pins tenant_id on every select", () => {
    const db = new ScopedDb("t1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = db.select("quotes", "*") as any;
    expect(q._eq).toContainEqual(["tenant_id", "t1"]);
  });
  it("injects tenant_id on insert, overwriting any caller-supplied value", async () => {
    const db = new ScopedDb("t1");
    const { data } = await db.insertOne("clients", { company_name: "Acme", tenant_id: "attacker" });
    expect((data as { tenant_id: string }).tenant_id).toBe("t1");
  });
  it("scopes updateById and deleteById by tenant", () => {
    const db = new ScopedDb("t1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = db.updateById("clients", "c1", { notes: "x" }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = db.deleteById("clients", "c1") as any;
    expect(u._eq).toContainEqual(["tenant_id", "t1"]);
    expect(d._eq).toContainEqual(["tenant_id", "t1"]);
  });
});

describe("ratelimit.enforceRateLimit", () => {
  it("passes under the limit", async () => {
    state.rpcCount = 5;
    expect(await enforceRateLimit("k1", 100)).toBeNull();
  });
  it("429s over the limit", async () => {
    state.rpcCount = 101;
    const res = await enforceRateLimit("k1", 100);
    expect(res?.status).toBe(429);
  });
});

describe("serialize", () => {
  it("computes proposal totals per scenario and curates fields", () => {
    const quote = { id: "q1", quote_number: "PROP-1", title: "T", status: "sent", client_id: "c1", tax_rate: 0.1, selected_scenario_id: null };
    const scenarios = [{ id: "s1", name: "Std", is_recommended: true, sort_order: 0 }];
    const items = new Map([["s1", [
      { description: "Managed", billing_period: "Monthly", quantity: 2, unit_price: 100, setup_price: 50, discount_percent: 0, discount_amount: 0, is_taxable: true },
      { description: "Onboard", billing_period: "One Time", quantity: 1, unit_price: 1000, setup_price: 0, discount_percent: 0, discount_amount: 0, is_taxable: true },
    ]]]);
    const out = serializeProposalDetail(quote, scenarios, items, { id: "c1", company_name: "Acme" });
    expect(out.totals).toEqual({ monthly: 200, one_time: 1100, currency: "USD" });
    expect(out.scenarios[0].line_items[0].line_total).toBe(300); // 2×100 + 2×50 setup
    // internal cost/margin never leak
    expect(JSON.stringify(out)).not.toMatch(/unit_cost|margin/);
  });
  it("serializeProduct omits cost", () => {
    const p = serializeProduct({ id: "p1", name: "Widget", unit_cost: 40, unit_price: 100, setup_price: 0, is_taxable: false });
    expect(p).not.toHaveProperty("unit_cost");
    expect(p.unit_price).toBe(100);
  });
});
