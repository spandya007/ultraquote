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

// Insert a minimal auth.users row (the local GoTrue schema) so a fixture can
// satisfy FKs that reference auth.users — e.g. organization_admins.user_id.
// auth.users is owned by supabase_auth_admin and the service_role has no grant
// on it, so this drops to the superuser (the postgres login role) for the write,
// then restores the service role. Rolled back with the test tx.
export async function seedAuthUser(c: PoolClient, id: string, email: string): Promise<void> {
  await c.query("reset role"); // back to the postgres superuser (bypasses auth-schema grants)
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())
     on conflict (id) do nothing`,
    [id, email]
  );
  await asService(c); // restore service role for the rest of the fixture setup
}
