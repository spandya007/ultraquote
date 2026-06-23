import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import {
  LOCAL_DB_URL, LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, OWNER, EXPIRED_OWNER,
} from "./config";

// Talk to GoTrue's admin API directly via fetch — avoids supabase-js, whose
// SupabaseClient constructor spins up a realtime client that needs a WebSocket
// global (absent on Node < 22, which the Playwright runner uses here).
const authHeaders = {
  apikey: LOCAL_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const adminUrl = (p: string) => `${LOCAL_SUPABASE_URL}/auth/v1/admin${p}`;

// Playwright globalSetup: rebuild the LOCAL Supabase DB to match production
// schema (schema.sql + migrations 012–017), seed tenants/catalog/client, then
// create real Auth owners (with passwords) via the GoTrue admin API and stamp
// their public.users rows (role/legal acceptance) so they clear the dashboard
// gates. Runs against 127.0.0.1 only — never cloud.

// Playwright runs from the project root, so resolve files relative to cwd
// (avoids import.meta, which would flip this module into ESM and break loading).
const file = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// schema.sql is current through 011 for columns, but its RLS section already
// includes 014's "quotes: owner delete" policy — so 014 is intentionally
// skipped here (re-applying it errors "policy already exists"). 012/013 add the
// subscription/kill-switch columns + trigger; 015/016/017 add the remaining
// additive columns/tables the app reads.
const MIGRATIONS = [
  "supabase/migrations/012_subscription_and_access.sql",
  "supabase/migrations/013_protect_tenant_admin_fields.sql",
  "supabase/migrations/015_add_tenant_font.sql",
  "supabase/migrations/016_add_legal_acceptance.sql",
  "supabase/migrations/017_beta_signups.sql",
];

async function resetDb() {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL });
  await client.connect();
  try {
    // The auth.users trigger depends on a public function; drop it first so the
    // cascade from dropping `public` can't leave a dangling trigger.
    await client.query("drop trigger if exists on_auth_user_created on auth.users;");
    await client.query("drop schema if exists public cascade; create schema public;");
    await client.query(file("supabase/schema.sql"));
    for (const m of MIGRATIONS) await client.query(file(m));
    // Dropping public drops default grants — restore them for the API roles.
    await client.query(`
      grant usage on schema public to anon, authenticated, service_role;
      grant all on all tables in schema public to anon, authenticated, service_role;
      grant all on all sequences in schema public to anon, authenticated, service_role;
      grant all on all functions in schema public to anon, authenticated, service_role;
    `);
    await client.query(file("tests/e2e/seed-e2e.sql"));
  } finally {
    await client.end();
  }
}

async function createOwners() {
  // Remove any leftover auth users from a previous run (auth schema isn't reset
  // by the public-schema drop), then recreate cleanly.
  const listRes = await fetch(adminUrl("/users?per_page=1000"), { headers: authHeaders });
  const existing = (await listRes.json()) as { users?: { id: string; email?: string }[] };
  for (const u of existing.users ?? []) {
    if (u.email === OWNER.email || u.email === EXPIRED_OWNER.email) {
      await fetch(adminUrl(`/users/${u.id}`), { method: "DELETE", headers: authHeaders });
    }
  }

  const sql = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL });
  await sql.connect();
  try {
    for (const o of [OWNER, EXPIRED_OWNER]) {
      // user_metadata.tenant_id + role drive the handle_new_auth_user trigger,
      // which inserts the matching public.users row as 'owner'.
      const res = await fetch(adminUrl("/users"), {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          email: o.email,
          password: o.password,
          email_confirm: true,
          user_metadata: { tenant_id: o.tenantId, full_name: o.fullName, role: "owner" },
        }),
      });
      const created = (await res.json()) as { id?: string; msg?: string; error?: string };
      if (!res.ok || !created.id) {
        throw new Error(`createUser failed for ${o.email}: ${created.msg || created.error || res.status}`);
      }
      // Stamp legal acceptance so the /account/accept-terms gate passes. (enabled
      // defaults true from migration 012; owners are force-enabled anyway.)
      await sql.query("update public.users set legal_accepted_at = now() where id = $1", [created.id]);

      // Make the active-tenant owner a platform admin too, so E2E can exercise
      // the /admin console (tenant dossier, etc.).
      if (o.email === OWNER.email) {
        await sql.query(
          "insert into public.platform_admins (user_id) values ($1) on conflict do nothing",
          [created.id]
        );
      }
    }
  } finally {
    await sql.end();
  }
}

export default async function globalSetup() {
  await resetDb();
  await createOwners();
}
