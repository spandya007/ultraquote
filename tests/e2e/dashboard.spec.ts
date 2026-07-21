import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { OWNER } from "./config";

test.describe("dashboard date-range control", () => {
  test("renders the range slider, presets, and filtered tiles", async ({ page }) => {
    await login(page, OWNER);
    await page.goto("/");

    await expect(page.getByText("Showing proposals created in this range")).toBeVisible({ timeout: 30_000 });
    // Dual-thumb slider = two range inputs.
    await expect(page.getByRole("slider")).toHaveCount(2);
    // The range-filtered stat tiles.
    await expect(page.getByText("Open pipeline")).toBeVisible();
    await expect(page.getByText("Win rate")).toBeVisible();

    // A preset still works (no crash; control stays visible).
    await page.getByRole("button", { name: "30d" }).click();
    await expect(page.getByText("Showing proposals created in this range")).toBeVisible();
  });
});
