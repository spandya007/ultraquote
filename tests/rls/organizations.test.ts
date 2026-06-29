import { describe, it, expect, afterAll } from "vitest";
import { pool, withTx, asService, asUser, seedAuthUser } from "./helpers";
import { T, ORG } from "./fixtures";

afterAll(() => pool.end());

// The Organization layer (migrations 019/020) is the security basis for the
// /org console: organizations, organization_admins and org_admin_invites all
// have RLS ENABLED with NO client policies, so they are reachable ONLY via the
// service-role key inside guarded /api/admin and /org routes (same pattern as
// platform_admins). These tests pin that "no authenticated client access"
// guarantee so a future stray policy or a dropped RLS flag fails CI.

describe("RLS — organizations table is service-role only", () => {
  it("an authenticated user cannot READ organizations (0 rows despite data)", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Acme Org')", [ORG.one]);

      await asUser(c, T.aOwner);
      const { rows } = await c.query("select count(*)::int as n from organizations");
      expect(rows[0].n).toBe(0);
    });
  });

  it("an authenticated user cannot INSERT an organization", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aOwner);
      await expect(
        c.query("insert into organizations (name) values ('Sneaky Org')")
      ).rejects.toThrow();
    });
  });

  it("the service role can read + write organizations", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Acme Org')", [ORG.one]);
      const { rows } = await c.query("select name from organizations where id = $1", [ORG.one]);
      expect(rows[0].name).toBe("Acme Org");
    });
  });
});

describe("RLS — organization_admins table is service-role only", () => {
  it("an authenticated user cannot READ organization_admins (0 rows despite data)", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Acme Org')", [ORG.one]);
      await seedAuthUser(c, ORG.adminAuthUser, "orgadmin@acme.test");
      await c.query(
        "insert into organization_admins (org_id, user_id) values ($1, $2)",
        [ORG.one, ORG.adminAuthUser]
      );

      await asUser(c, T.aOwner);
      const { rows } = await c.query("select count(*)::int as n from organization_admins");
      expect(rows[0].n).toBe(0);
    });
  });

  it("an authenticated user cannot INSERT themselves as an org admin", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Acme Org')", [ORG.one]);

      // A tenant owner trying to grant themselves the Org-Admin hat is blocked
      // by RLS before the FK is ever checked.
      await asUser(c, T.aOwner);
      await expect(
        c.query("insert into organization_admins (org_id, user_id) values ($1, $2)", [ORG.one, T.aOwner])
      ).rejects.toThrow();
    });
  });
});

describe("RLS — org_admin_invites table is service-role only", () => {
  it("an authenticated user cannot READ org_admin_invites (0 rows despite data)", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Acme Org')", [ORG.one]);
      await c.query(
        "insert into org_admin_invites (org_id, email) values ($1, 'invitee@acme.test')",
        [ORG.one]
      );

      await asUser(c, T.aOwner);
      const { rows } = await c.query("select count(*)::int as n from org_admin_invites");
      expect(rows[0].n).toBe(0);
    });
  });

  it("an authenticated user cannot INSERT an org admin invite", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Acme Org')", [ORG.one]);

      await asUser(c, T.aOwner);
      await expect(
        c.query("insert into org_admin_invites (org_id, email) values ($1, 'x@acme.test')", [ORG.one])
      ).rejects.toThrow();
    });
  });
});

describe("RLS — platform_admins table is service-role only", () => {
  // Retrofit of the same no-policy guarantee for the pre-existing platform_admins
  // table (migration 007), which underpins getPlatformAdminUser() / the /admin
  // console exactly as the org tables underpin /org.
  it("an authenticated user cannot READ platform_admins (0 rows despite data)", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into platform_admins (user_id) values ($1)", [T.aOwner]);

      await asUser(c, T.bMember);
      const { rows } = await c.query("select count(*)::int as n from platform_admins");
      expect(rows[0].n).toBe(0);
    });
  });

  it("an authenticated user cannot INSERT themselves as a platform admin", async () => {
    await withTx(async (c) => {
      await asUser(c, T.aMember);
      await expect(
        c.query("insert into platform_admins (user_id) values ($1)", [T.aMember])
      ).rejects.toThrow();
    });
  });
});

describe("RLS — tenant isolation holds when workspaces share an organization", () => {
  // organization_id is additive: grouping two workspaces under one Organization
  // must NOT widen data visibility between them. A member of Tenant A still sees
  // none of Tenant B's data even when both belong to the same org.
  it("a member cannot see a sibling workspace's clients within the same org", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("insert into organizations (id, name) values ($1, 'Shared Org')", [ORG.one]);
      await c.query("update tenants set organization_id = $1 where id in ($2, $3)", [ORG.one, T.A, T.B]);
      await c.query("insert into clients (tenant_id, company_name) values ($1,'Acme A')", [T.A]);
      await c.query("insert into clients (tenant_id, company_name) values ($1,'Beta B')", [T.B]);

      await asUser(c, T.aMember);
      const { rows } = await c.query("select company_name from clients order by company_name");
      expect(rows.map((r) => r.company_name)).toEqual(["Acme A"]);
    });
  });
});
