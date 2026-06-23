import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { OWNER, ACTIVE_TENANT_ID } from "./config";

// The seeded OWNER is also a platform admin (see global-setup), so they can
// reach the /admin tenant dossier. The active tenant has 1 active catalog
// product + 1 client seeded.
test.describe("tenant dossier (pre-deletion review)", () => {
  test("platform admin sees the tenant workspace contents + report", async ({ page }) => {
    await login(page, OWNER);

    await page.goto(`/admin/tenants/${ACTIVE_TENANT_ID}`);
    await expect(page.getByRole("heading", { name: "E2E Active Co" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Workspace contents")).toBeVisible();
    // The seeded active product is flagged as worth keeping.
    await expect(page.getByText("Active catalog products", { exact: false })).toBeVisible();
    await expect(page.getByText("Managed Workstation").first()).toBeVisible();

    // The downloadable report renders standalone HTML.
    await page.goto(`/admin/tenants/${ACTIVE_TENANT_ID}/report`);
    await expect(page.getByText(/Your UltraQuote workspace summary/i)).toBeVisible();
    await expect(page.getByText("Managed Workstation").first()).toBeVisible();
  });

  test("owner sees their own workspace summary in Settings", async ({ page }) => {
    await login(page, OWNER);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Your workspace" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Active products")).toBeVisible();
  });
});
