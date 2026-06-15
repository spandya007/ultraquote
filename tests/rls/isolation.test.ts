import { describe, it, expect, afterAll } from "vitest";
import { pool, withTx, asService, asUser } from "./helpers";
import { T } from "./fixtures";

afterAll(() => pool.end());

describe("RLS — tenant isolation (clients)", () => {
  it("a member sees only their own tenant's clients", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into clients (tenant_id, company_name) values ($1,'Acme A')", [T.A]);
      await c.query("insert into clients (tenant_id, company_name) values ($1,'Beta B')", [T.B]);

      await asUser(c, T.aMember);
      const { rows } = await c.query("select company_name from clients order by company_name");
      expect(rows.map((r) => r.company_name)).toEqual(["Acme A"]);
    });
  });

  it("the other tenant's member cannot see those clients", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into clients (tenant_id, company_name) values ($1,'Acme A')", [T.A]);

      await asUser(c, T.bMember);
      const { rows } = await c.query("select count(*)::int as n from clients where company_name = 'Acme A'");
      expect(rows[0].n).toBe(0);
    });
  });

  it("a member cannot create a client in another tenant (WITH CHECK)", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aMember);
      await expect(
        c.query("insert into clients (tenant_id, company_name) values ($1,'X')", [T.B])
      ).rejects.toThrow();
    });
  });
});

describe("RLS — platform-managed tenant fields (migration 013 trigger)", () => {
  it("a tenant owner cannot change their Company Name", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aOwner);
      await expect(
        c.query("update tenants set name = 'Hacked' where id = $1", [T.A])
      ).rejects.toThrow(/Company name/i);
    });
  });

  it("the service role (platform admin path) can change it", async () => {
    await withTx(async (c) => {
      await asService(c);
      await expect(
        c.query("update tenants set name = 'Renamed by admin' where id = $1", [T.A])
      ).resolves.toBeTruthy();
    });
  });
});
