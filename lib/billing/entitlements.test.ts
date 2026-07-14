import { describe, it, expect } from "vitest";
import { buildMatrix, matrixHasFeature, type PlanFeatureRow } from "./entitlements";

// Mirrors the seed in migration 028: integrations ON for beta + all subscription
// tiers, OFF for pay-per-use.
const SEED: PlanFeatureRow[] = [
  { plan: "beta", feature_key: "integrations", enabled: true },
  { plan: "pay_per_use", feature_key: "integrations", enabled: false },
  { plan: "starter", feature_key: "integrations", enabled: true },
  { plan: "standard", feature_key: "integrations", enabled: true },
  { plan: "pro", feature_key: "integrations", enabled: true },
  { plan: "ultra", feature_key: "integrations", enabled: true },
];

describe("buildMatrix", () => {
  it("indexes rows by plan then feature", () => {
    const m = buildMatrix(SEED);
    expect(m.starter.integrations).toBe(true);
    expect(m.pay_per_use.integrations).toBe(false);
  });

  it("last row wins on duplicate (plan,feature)", () => {
    const m = buildMatrix([
      { plan: "pro", feature_key: "integrations", enabled: false },
      { plan: "pro", feature_key: "integrations", enabled: true },
    ]);
    expect(m.pro.integrations).toBe(true);
  });
});

describe("matrixHasFeature", () => {
  const m = buildMatrix(SEED);

  it("subscription tiers get integrations", () => {
    for (const plan of ["starter", "standard", "pro", "ultra"]) {
      expect(matrixHasFeature(m, plan, "integrations")).toBe(true);
    }
  });

  it("beta gets integrations (grandfathered current users)", () => {
    expect(matrixHasFeature(m, "beta", "integrations")).toBe(true);
  });

  it("pay-per-use does NOT get integrations", () => {
    expect(matrixHasFeature(m, "pay_per_use", "integrations")).toBe(false);
  });

  it("fails closed on unknown plan, null/undefined plan, and unknown feature", () => {
    expect(matrixHasFeature(m, "enterprise", "integrations")).toBe(false);
    expect(matrixHasFeature(m, null, "integrations")).toBe(false);
    expect(matrixHasFeature(m, undefined, "integrations")).toBe(false);
    expect(matrixHasFeature(m, "pro", "nonexistent_feature")).toBe(false);
  });
});
