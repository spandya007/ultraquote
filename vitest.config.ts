import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Phase 1: unit tests for pure business logic in lib/. Node environment (no DOM
// needed). The `@/` alias mirrors tsconfig paths so tests import like the app.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, ""),
    },
  },
});
