import { describe, it, expect } from "vitest";
import { lineRev, lineSetup, calcTotals } from "./serialize";
import type { SerializeLineItem, SerializeScenario } from "./types";

// Helper to build a line item with sensible defaults.
function item(over: Partial<SerializeLineItem> = {}): SerializeLineItem {
  return {
    description: "Item",
    billing_period: "Monthly",
    quantity: 1,
    unit_price: 0,
    setup_price: null,
    is_taxable: false,
    discount_percent: null,
    discount_amount: null,
    ...over,
  };
}

function scenario(items: SerializeLineItem[]): SerializeScenario {
  return { id: "s1", name: "S", is_recommended: false, sort_order: 0, line_items: items };
}

describe("lineRev (discounted line revenue)", () => {
  it("multiplies qty × unit price with no discount", () => {
    expect(lineRev(item({ quantity: 3, unit_price: 100 }))).toBe(300);
  });

  it("applies a percent discount", () => {
    expect(lineRev(item({ quantity: 2, unit_price: 100, discount_percent: 10 }))).toBe(180);
  });

  it("applies a fixed-amount discount", () => {
    expect(lineRev(item({ quantity: 1, unit_price: 100, discount_amount: 25 }))).toBe(75);
  });

  it("applies percent then fixed when both are set", () => {
    // 200 → -10% = 180 → -30 = 150
    expect(lineRev(item({ quantity: 2, unit_price: 100, discount_percent: 10, discount_amount: 30 }))).toBe(150);
  });

  it("floors at 0 (discount can't go negative)", () => {
    expect(lineRev(item({ quantity: 1, unit_price: 50, discount_amount: 999 }))).toBe(0);
  });

  it("treats null unit price as 0", () => {
    expect(lineRev(item({ quantity: 5, unit_price: null }))).toBe(0);
  });
});

describe("lineSetup (one-time per-unit setup fee)", () => {
  it("multiplies setup price by quantity", () => {
    expect(lineSetup(item({ quantity: 4, setup_price: 25 }))).toBe(100);
  });
  it("is 0 when no setup price", () => {
    expect(lineSetup(item({ quantity: 4, setup_price: null }))).toBe(0);
  });
});

describe("calcTotals", () => {
  it("splits monthly vs one-time and folds setup into one-time", () => {
    const t = calcTotals(scenario([
      item({ billing_period: "Monthly", quantity: 1, unit_price: 100 }),
      item({ billing_period: "One Time", quantity: 1, unit_price: 500, setup_price: 50 }),
    ]), 0);
    expect(t.monthly).toBe(100);
    expect(t.setup).toBe(50);
    expect(t.onetime).toBe(550); // 500 one-time + 50 setup
    expect(t.tax).toBe(0);
    expect(t.total).toBe(650);   // monthly + onetime + tax
  });

  it("setup on a Monthly line still lands in one-time, not monthly", () => {
    const t = calcTotals(scenario([
      item({ billing_period: "Monthly", quantity: 2, unit_price: 100, setup_price: 30 }),
    ]), 0);
    expect(t.monthly).toBe(200);
    expect(t.setup).toBe(60);    // 2 × 30
    expect(t.onetime).toBe(60);  // setup only
  });

  it("taxes only taxable lines, on discounted revenue + setup", () => {
    const t = calcTotals(scenario([
      item({ billing_period: "Monthly", quantity: 1, unit_price: 100, is_taxable: true, setup_price: 20 }),
      item({ billing_period: "Monthly", quantity: 1, unit_price: 100, is_taxable: false }),
    ]), 0.1);
    // taxable base = 100 (rev) + 20 (setup) = 120; tax = 12
    expect(t.tax).toBeCloseTo(12, 5);
  });

  it("tax is computed on discounted (not gross) revenue", () => {
    const t = calcTotals(scenario([
      item({ billing_period: "Monthly", quantity: 1, unit_price: 100, discount_percent: 50, is_taxable: true }),
    ]), 0.1);
    expect(t.tax).toBeCloseTo(5, 5); // 50 discounted × 10%
  });

  it("reports total savings from discounts", () => {
    const t = calcTotals(scenario([
      item({ quantity: 1, unit_price: 100, discount_percent: 10 }),  // saves 10
      item({ quantity: 1, unit_price: 100, discount_amount: 25 }),   // saves 25
    ]), 0);
    expect(t.savings).toBe(35);
  });

  it("empty scenario is all zeros", () => {
    const t = calcTotals(scenario([]), 0.1);
    expect(t).toMatchObject({ monthly: 0, onetime: 0, setup: 0, tax: 0, total: 0, savings: 0 });
  });
});
