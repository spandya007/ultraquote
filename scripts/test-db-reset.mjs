// Rebuild the LOCAL Supabase test database from scratch, using node-postgres so
// no `psql` client is required:
//   schema.sql (base, current through migration 011) + 012…020 + test seed.
// The CLI's numbered-migration auto-apply is disabled (supabase/config.toml)
// because 001–020 are deltas on top of schema.sql, not a from-scratch sequence.
//
// ⚠️ Keep DELTA_MIGRATIONS in sync as new numbered migrations land past 011, or
// the RLS test DB silently drifts from prod (the org tables 019/020 were exactly
// such a drift — schema.sql is frozen at 011, so anything newer must be listed
// here or it never reaches the test database).
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

// Delta migrations applied IN ORDER on top of schema.sql. schema.sql is mostly
// "through 011", BUT it already carries migration 014's "quotes: owner delete"
// policy (hand-edited in), so 014 is intentionally EXCLUDED here — re-running its
// `create policy` would fail ("already exists"). Everything else from 012 on is
// absent from schema.sql and must be applied. (Long-term cleanup: regenerate
// schema.sql from the live DB and reset this list.)
const DELTA_MIGRATIONS = [
  "012_subscription_and_access.sql",
  "013_protect_tenant_admin_fields.sql",
  // 014 already present in schema.sql — see note above.
  "015_add_tenant_font.sql",
  "016_add_legal_acceptance.sql",
  "017_beta_signups.sql",
  "018_tenant_deletion_schedule.sql",
  "019_organizations.sql",
  "020_org_admin_provenance.sql",
];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  console.log("→ Rebuilding local test DB", url);
  await client.query("drop schema if exists public cascade; create schema public;");
  await client.query(file("supabase/schema.sql"));
  for (const m of DELTA_MIGRATIONS) {
    await client.query(file(`supabase/migrations/${m}`));
  }
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
