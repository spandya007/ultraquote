import { defineConfig } from "vitest/config";

// Phase 2: RLS / multi-tenant security tests. These need a running local
// Supabase Postgres (`supabase start`) + the test DB built by
// scripts/test-db-reset.sh. Kept SEPARATE from the unit suite (vitest.config.ts)
// so `npm test` and CI stay DB-free. Run with `npm run test:rls`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
