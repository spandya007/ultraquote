// Rebuild the LOCAL Supabase test database from scratch, using node-postgres so
// no `psql` client is required:
//   schema.sql (base, current through migration 011) + 012 + 013 + test seed.
// The CLI's numbered-migration auto-apply is disabled (supabase/config.toml)
// because 001–013 are deltas on top of schema.sql, not a from-scratch sequence.
//
// Requires a running `supabase start` stack. Override the DB URL with
// SUPABASE_DB_URL if your local port differs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const file = (p) => readFileSync(join(root, p), "utf8");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  console.log("→ Rebuilding local test DB", url);
  await client.query("drop schema if exists public cascade; create schema public;");
  await client.query(file("supabase/schema.sql"));
  await client.query(file("supabase/migrations/012_subscription_and_access.sql"));
  await client.query(file("supabase/migrations/013_protect_tenant_admin_fields.sql"));
  // Dropping public drops default grants — restore them for the API roles.
  await client.query(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
    grant all on all functions in schema public to anon, authenticated, service_role;
  `);
  await client.query(file("supabase/seed-test.sql"));
  console.log("✓ Local test DB ready.");
} finally {
  await client.end();
}
