// Shared config for the Playwright E2E suite. Targets the LOCAL Supabase stack
// (Colima/Docker via `supabase start`) — never cloud dev/prod. The keys below
// are Supabase's well-known DEFAULT local-dev keys (identical on every machine),
// so they're safe to commit; they are NOT secrets and only work against
// 127.0.0.1.

export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Seeded tenants/users. UUIDs are fixed so tests can reference rows directly.
export const ACTIVE_TENANT_ID = "11111111-1111-1111-1111-111111111111";
export const EXPIRED_TENANT_ID = "22222222-2222-2222-2222-222222222222";

export const OWNER = {
  email: "e2e-owner@ultraquote.test",
  password: "E2e-Test-Passw0rd!",
  fullName: "Eve Owner",
  tenantId: ACTIVE_TENANT_ID,
};

export const EXPIRED_OWNER = {
  email: "e2e-expired@ultraquote.test",
  password: "E2e-Test-Passw0rd!",
  fullName: "Ex Pired",
  tenantId: EXPIRED_TENANT_ID,
};

export const BASE_URL = "http://localhost:3000";
