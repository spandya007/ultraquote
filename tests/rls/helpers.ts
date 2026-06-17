import { Pool, type PoolClient } from "pg";

// Connects to the LOCAL Supabase Postgres (started via `supabase start`).
// Override with SUPABASE_DB_URL if your local port differs.
export const pool = new Pool({
  connectionString:
    process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});

// Run `fn` inside a transaction that is ALWAYS rolled back, so tests never
// mutate the seeded fixtures and can run in any order.
export async function withTx(fn: (c: PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await fn(c);
  } finally {
    try { await c.query("rollback"); } catch { /* ignore */ }
    c.release();
  }
}

// Switch the transaction to the service role (bypasses RLS) — used to set up
// fixture rows inside a test before asserting access as a normal user.
export async function asService(c: PoolClient): Promise<void> {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
  await c.query("set local role service_role");
}

// Switch the transaction to an authenticated end-user (RLS enforced). auth.uid()
// resolves to `uid` via the request.jwt.claims GUC, exactly like PostgREST.
export async function asUser(c: PoolClient, uid: string): Promise<void> {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
  await c.query("set local role authenticated");
}
