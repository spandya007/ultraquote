import { describe, it, expect, afterAll } from "vitest";
import { pool, withTx, asService, asUser } from "./helpers";
import { T } from "./fixtures";

afterAll(() => pool.end());

// Helper: create a client in a tenant (quotes need client_id) and return its id.
async function makeClient(c: import("pg").PoolClient, tenantId: string) {
  const { rows } = await c.query(
    "insert into clients (tenant_id, company_name) values ($1,'C') returning id", [tenantId]
  );
  return rows[0].id as string;
}

describe("RLS — quotes (tenant-wide read, creator-or-owner write)", () => {
  it("isolation: another tenant can't see a quote", async () => {
    await withTx(async (c) => {
      await asService(c);
      const cid = await makeClient(c, T.A);
      await c.query("insert into quotes (tenant_id, client_id, quote_number, created_by) values ($1,$2,'A-1',$3)", [T.A, cid, T.aMember]);
      await asUser(c, T.bMember);
      const { rows } = await c.query("select count(*)::int n from quotes where quote_number='A-1'");
      expect(rows[0].n).toBe(0);
    });
  });

  it("read is tenant-wide: a member sees a teammate's quote", async () => {
    await withTx(async (c) => {
      await asService(c);
      const cid = await makeClient(c, T.A);
      await c.query("insert into quotes (tenant_id, client_id, quote_number, created_by) values ($1,$2,'A-1',$3)", [T.A, cid, T.aOwner]);
      await asUser(c, T.aMember);
      const { rows } = await c.query("select count(*)::int n from quotes where quote_number='A-1'");
      expect(rows[0].n).toBe(1);
    });
  });

  it("a member can edit their OWN quote but not a teammate's", async () => {
    await withTx(async (c) => {
      await asService(c);
      const cid = await makeClient(c, T.A);
      await c.query("insert into quotes (tenant_id, client_id, quote_number, created_by) values ($1,$2,'OWN',$3)", [T.A, cid, T.aMember]);
      await c.query("insert into quotes (tenant_id, client_id, quote_number, created_by) values ($1,$2,'OTH',$3)", [T.A, cid, T.aOwner]);

      await asUser(c, T.aMember);
      const own = await c.query("update quotes set title='x' where quote_number='OWN'");
      expect(own.rowCount).toBe(1);
      // Not creator, not owner → RLS update matches no rows (silently affects 0).
      const oth = await c.query("update quotes set title='x' where quote_number='OTH'");
      expect(oth.rowCount).toBe(0);
    });
  });

  it("the tenant owner can edit any quote in the tenant", async () => {
    await withTx(async (c) => {
      await asService(c);
      const cid = await makeClient(c, T.A);
      await c.query("insert into quotes (tenant_id, client_id, quote_number, created_by) values ($1,$2,'M',$3)", [T.A, cid, T.aMember]);
      await asUser(c, T.aOwner);
      const r = await c.query("update quotes set title='x' where quote_number='M'");
      expect(r.rowCount).toBe(1);
    });
  });

  it("a member can't insert a quote into another tenant (WITH CHECK)", async () => {
    await withTx(async (c) => {
      await asService(c);
      const cidB = await makeClient(c, T.B);
      await asUser(c, T.aMember);
      await expect(
        c.query("insert into quotes (tenant_id, client_id, quote_number, created_by) values ($1,$2,'X',$3)", [T.B, cidB, T.aMember])
      ).rejects.toThrow();
    });
  });
});

describe("RLS — products (tenant-wide read, owner-only write)", () => {
  it("isolation: another tenant can't see a product", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into products (tenant_id, name) values ($1,'Widget A')", [T.A]);
      await asUser(c, T.bMember);
      const { rows } = await c.query("select count(*)::int n from products where name='Widget A'");
      expect(rows[0].n).toBe(0);
    });
  });

  it("a member cannot insert products (owner-only)", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aMember);
      // A failed statement aborts the tx, so this is the only assertion here.
      await expect(
        c.query("insert into products (tenant_id, name) values ($1,'Q')", [T.A])
      ).rejects.toThrow();
    });
  });

  it("a member cannot update products (owner-only → 0 rows)", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into products (tenant_id, name) values ($1,'P')", [T.A]);
      await asUser(c, T.aMember);
      const upd = await c.query("update products set name='P2' where name='P'");
      expect(upd.rowCount).toBe(0);
    });
  });

  it("the owner can insert and update products", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aOwner);
      const ins = await c.query("insert into products (tenant_id, name) values ($1,'P') returning id", [T.A]);
      expect(ins.rowCount).toBe(1);
      const upd = await c.query("update products set name='P2' where name='P'");
      expect(upd.rowCount).toBe(1);
    });
  });
});

describe("RLS — templates (member insert, creator-or-owner write)", () => {
  it("a member can create a template, edit their own, not a teammate's", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into templates (tenant_id, name, created_by) values ($1,'OTH',$2)", [T.A, T.aOwner]);

      await asUser(c, T.aMember);
      const ins = await c.query("insert into templates (tenant_id, name, created_by) values ($1,'MINE',$2) returning id", [T.A, T.aMember]);
      expect(ins.rowCount).toBe(1);
      const own = await c.query("update templates set name='m2' where name='MINE'");
      expect(own.rowCount).toBe(1);
      const oth = await c.query("update templates set name='o2' where name='OTH'");
      expect(oth.rowCount).toBe(0);
    });
  });

  it("isolation: another tenant can't see a template", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into templates (tenant_id, name, created_by) values ($1,'TA',$2)", [T.A, T.aOwner]);
      await asUser(c, T.bMember);
      const { rows } = await c.query("select count(*)::int n from templates where name='TA'");
      expect(rows[0].n).toBe(0);
    });
  });
});

describe("RLS — tenant settings (owner-only write)", () => {
  it("a member can't change settings; the owner can", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aMember);
      const m = await c.query("update tenant_settings set default_payment_terms='Net 60' where tenant_id=$1", [T.A]);
      expect(m.rowCount).toBe(0);
      await asUser(c, T.aOwner);
      const o = await c.query("update tenant_settings set default_payment_terms='Net 60' where tenant_id=$1", [T.A]);
      expect(o.rowCount).toBe(1);
    });
  });
});
