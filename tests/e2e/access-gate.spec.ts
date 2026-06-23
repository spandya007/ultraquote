import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { EXPIRED_OWNER } from "./config";

test.describe("access lifecycle gate", () => {
  test("an expired tenant's owner is blocked from the dashboard", async ({ page }) => {
    await login(page, EXPIRED_OWNER);
    // The dashboard layout resolves access = "expired" and redirects to the
    // block page instead of letting them in.
    await expect(page).toHaveURL(/\/account\/suspended/);
    await expect(page.getByText(/expired/i)).toBeVisible();
  });

  test("the expired owner cannot reach the quotes page directly", async ({ page }) => {
    await login(page, EXPIRED_OWNER);
    await page.goto("/quotes");
    // Still gated — bounced to the block page, never the quotes list.
    await expect(page).toHaveURL(/\/account\/suspended/);
  });
});
