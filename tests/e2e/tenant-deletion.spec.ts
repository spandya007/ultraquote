import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { OWNER, PURGE_OWNER, PURGE_TENANT_ID, BASE_URL } from "./config";

// OWNER is a platform admin (global-setup). Exercises the full deletion flow on
// the throwaway "E2E Purge Target" tenant: schedule -> confirm scheduled state
// -> the tenant's owner sees the warning banner -> delete now -> tenant is gone
// (cascade), so its dossier 404s.
test.describe("tenant deletion (Phase 2)", () => {
  test("schedule, warn the owner, then purge", async ({ page, browser }) => {
    await login(page, OWNER);
    await page.goto(`/admin/tenants/${PURGE_TENANT_ID}`);
    await expect(page.getByRole("heading", { name: "E2E Purge Target" })).toBeVisible({ timeout: 30_000 });

    // Danger zone: type the exact name + schedule.
    await page.getByPlaceholder('Type "E2E Purge Target" to confirm').fill("E2E Purge Target");
    await page.getByRole("button", { name: "Schedule deletion" }).click();
    await expect(page.getByText(/Scheduled for permanent deletion/i)).toBeVisible({ timeout: 15_000 });

    // The purge tenant's owner now sees the deletion warning on their dashboard.
    const ownerCtx = await browser.newContext({ baseURL: BASE_URL });
    const ownerPage = await ownerCtx.newPage();
    await login(ownerPage, PURGE_OWNER);
    await ownerPage.goto("/");
    await expect(ownerPage.getByText(/scheduled for permanent deletion/i)).toBeVisible({ timeout: 30_000 });
    await ownerCtx.close();

    // Admin purges immediately (override the grace window).
    page.once("dialog", (d) => d.accept());
    await page.getByPlaceholder('Type "E2E Purge Target" to delete now').fill("E2E Purge Target");
    await page.getByRole("button", { name: "Delete now" }).click();

    // Lands back on /admin; the tenant is gone -> its dossier 404s.
    await page.waitForURL(/\/admin$/, { timeout: 15_000 });
    const res = await page.goto(`/admin/tenants/${PURGE_TENANT_ID}`);
    expect(res?.status()).toBe(404);
  });
});
