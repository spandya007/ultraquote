import { describe, it, expect, afterAll } from "vitest";
import { pool, withTx, asService } from "./helpers";
import { T } from "./fixtures";

afterAll(() => pool.end());

// migration 012: tenant_can_read/write + user_can_read/write. These mirror the
// app's getAccessState logic in SQL (for the planned RLS hardening). Read is
// allowed through the 7-day grace window; write is blocked once expired.
describe("RLS — access helper functions (migration 012)", () => {
  async function flags(c: import("pg").PoolClient, id: string, fn: "tenant" | "user") {
    const { rows } = await c.query(
      `select public.${fn}_can_read($1) as r, public.${fn}_can_write($1) as w`, [id]
    );
    return rows[0] as { r: boolean; w: boolean };
  }

  it("unlimited (null end date): read + write allowed", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("update tenants set subscription_end = null, platform_enabled = true where id = $1", [T.A]);
      expect(await flags(c, T.A, "tenant")).toEqual({ r: true, w: true });
    });
  });

  it("in grace (ended yesterday): read allowed, write blocked", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("update tenants set subscription_end = current_date - 1, platform_enabled = true where id = $1", [T.A]);
      expect(await flags(c, T.A, "tenant")).toEqual({ r: true, w: false });
    });
  });

  it("expired past grace (ended 30 days ago): read + write blocked", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("update tenants set subscription_end = current_date - 30, platform_enabled = true where id = $1", [T.A]);
      expect(await flags(c, T.A, "tenant")).toEqual({ r: false, w: false });
    });
  });

  it("platform switch off: read + write blocked regardless of dates", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("update tenants set subscription_end = null, platform_enabled = false where id = $1", [T.A]);
      expect(await flags(c, T.A, "tenant")).toEqual({ r: false, w: false });
    });
  });

  it("disabled user: read + write blocked even on an active tenant", async () => {
    await withTx(async (c) => {
      await asService(c);
      await c.query("update tenants set subscription_end = null, platform_enabled = true where id = $1", [T.A]);
      await c.query("update users set enabled = false where id = $1", [T.aMember]);
      expect(await flags(c, T.aMember, "user")).toEqual({ r: false, w: false });
    });
  });
});
