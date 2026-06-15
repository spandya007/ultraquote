import { describe, it, expect } from "vitest";
import { parseCsvText } from "./csv-products";

describe("parseCsvText", () => {
  it("errors when there's no data row", () => {
    const res = parseCsvText("Item Name");
    expect(res.error).toBeTruthy();
    expect(res.products).toHaveLength(0);
  });

  it("errors when no product-name column is present", () => {
    const res = parseCsvText("Color,Size\nred,large");
    expect(res.error).toBeTruthy();
  });

  it("parses a minimal file with only Item Name", () => {
    const res = parseCsvText("Item Name\nAcme Widget");
    expect(res.error).toBeUndefined();
    expect(res.products).toHaveLength(1);
    expect(res.products[0].name).toBe("Acme Widget");
    expect(res.products[0].pricing_tiers).toHaveLength(1);
    expect(res.products[0].pricing_tiers[0].is_default).toBe(true);
  });

  it("recognizes header aliases (Price → unit_price)", () => {
    const res = parseCsvText("Item Name,Price\nWidget,100");
    expect(res.products[0].unit_price).toBe(100);
    expect(res.products[0].pricing_tiers[0].unit_price).toBe(100);
  });

  it("groups rows with the same name into one product with a tier each", () => {
    const csv = "Item Name,Pricing Name,Sell Price\nWidget,Bronze,10\nWidget,Gold,20";
    const res = parseCsvText(csv);
    expect(res.products).toHaveLength(1);
    expect(res.products[0].pricing_tiers.map((t) => t.tier_name)).toEqual(["Bronze", "Gold"]);
  });

  it("handles multi-line quoted fields (description with an embedded newline)", () => {
    const csv = 'Item Name,Item Description\nWidget,"line one\nline two"';
    const res = parseCsvText(csv);
    expect(res.products[0].description).toBe("line one\nline two");
  });
});
