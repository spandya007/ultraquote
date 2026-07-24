import { describe, it, expect } from "vitest";
import { createProposal, addScenario, addLineItem, MutationError } from "./mutations";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Minimal ScopedDb stub. `results` is keyed by "select:<table>" / "child:<table>"
// → { single, list, error }. insertOne echoes the row with a generated id.
function mockDb(config: { results?: Record<string, any>; rpc?: any } = {}): any {
  const results = config.results ?? {};
  const builder = (key: string) => {
    const r = results[key] ?? {};
    const b: any = { _row: undefined };
    b.select = () => b; b.eq = () => b; b.ilike = () => b; b.limit = () => b; b.order = () => b; b.in = () => b;
    b.insert = (row: any) => { b._row = row; return b; };
    b.update = () => b;
    b.maybeSingle = () => Promise.resolve({ data: r.single ?? null, error: r.error ?? null });
    b.single = () => Promise.resolve({ data: r.single ?? { id: "gen-id", ...(b._row || {}) }, error: r.error ?? null });
    b.then = (res: any) => res({ data: r.list ?? [], error: null });
    return b;
  };
  return {
    tenantId: "t1",
    admin: { rpc: () => Promise.resolve(config.rpc ?? { data: "PROP-2026-001", error: null }) },
    select: (table: string) => builder("select:" + table),
    insertOne: (table: string, row: any) =>
      Promise.resolve({ data: { id: "q-new", ...(results["insert:" + table]?.single ?? {}), ...row }, error: null }),
    child: (table: string) => builder("child:" + table),
  };
}

describe("createProposal", () => {
  it("rejects a client not in the workspace", async () => {
    const db = mockDb({ results: { "select:clients": { single: null } } });
    await expect(createProposal(db, { clientId: "c1" })).rejects.toMatchObject({ code: "client_not_found" });
  });
  it("requires client_id", async () => {
    await expect(createProposal(mockDb(), { clientId: "" })).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("creates a draft with an allocated number", async () => {
    const db = mockDb({
      results: {
        "select:clients": { single: { id: "c1" } },
        "select:quotes": { single: null }, // no dup title
        "select:tenant_settings": { single: { default_tax_rate: 0.1 } },
      },
      rpc: { data: "PROP-2026-007", error: null },
    });
    const out = await createProposal(db, { clientId: "c1", title: "Website", createdBy: "u1" });
    expect(out.quote_number).toBe("PROP-2026-007");
    expect(out.title).toBe("Website");
    expect(out.status).toBe("draft");
  });
  it("rejects a duplicate title", async () => {
    const db = mockDb({ results: { "select:clients": { single: { id: "c1" } }, "select:quotes": { single: { id: "dup" } } } });
    await expect(createProposal(db, { clientId: "c1", title: "Dup" })).rejects.toMatchObject({ code: "duplicate_title" });
  });
});

describe("addScenario", () => {
  it("rejects a proposal not in the workspace", async () => {
    const db = mockDb({ results: { "select:quotes": { single: null } } });
    await expect(addScenario(db, { quoteId: "q1" })).rejects.toMatchObject({ code: "proposal_not_found" });
  });
});

describe("addLineItem — tenant isolation", () => {
  it("rejects when the scenario's quote is NOT in this tenant (child table bypasses RLS)", async () => {
    const db = mockDb({
      results: {
        "child:quote_scenarios": { single: { id: "s1", quote_id: "q-other" } }, // scenario exists (raw)
        "select:quotes": { single: null }, // but its quote is not visible to this tenant
      },
    });
    await expect(addLineItem(db, { scenarioId: "s1", description: "x", unitPrice: 1 }))
      .rejects.toMatchObject({ code: "scenario_not_found" });
  });
  it("rejects free-text without a description", async () => {
    const db = mockDb({
      results: {
        "child:quote_scenarios": { single: { id: "s1", quote_id: "q1" } },
        "select:quotes": { single: { id: "q1", tax_rate: 0.1 } },
      },
    });
    await expect(addLineItem(db, { scenarioId: "s1" })).rejects.toMatchObject({ code: "invalid_request" });
  });
  it("throws MutationError instances (mappable to codes/status)", async () => {
    const db = mockDb({ results: { "child:quote_scenarios": { single: null } } });
    await expect(addLineItem(db, { scenarioId: "s1", description: "x" })).rejects.toBeInstanceOf(MutationError);
  });
});
