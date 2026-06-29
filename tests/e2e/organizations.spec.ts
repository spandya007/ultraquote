import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { ORG_ADMIN, OWNER, ACTIVE_TENANT_ID, EXPIRED_TENANT_ID } from "./config";

// End-to-end coverage for the Organization (Org Admin) console — the routing,
// guard and scope-isolation layer that the RLS/unit suites can't reach. The
// seeded Org Admin (no public.users row) is scoped to the E2E Org, which
// contains exactly one workspace: the ACTIVE tenant. The EXPIRED tenant is
// standalone, so it must be invisible/unreachable to this Org Admin.

test.describe("Org Admin console (/org)", () => {
  test("an Org Admin lands on /org and sees only their org's workspace", async ({ page }) => {
    await login(page, ORG_ADMIN);

    // A pure Org Admin (no workspace membership) is routed to /org, not the
    // tenant dashboard.
    await expect(page).toHaveURL(/\/org$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "E2E Org" })).toBeVisible();
    await expect(page.getByText("Org Admin", { exact: true })).toBeVisible();

    // Their org's workspace is listed.
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
    await expect(page.getByText("E2E Active Co")).toBeVisible();
    // A workspace from outside the org never appears.
    await expect(page.getByText("E2E Expired Co")).toHaveCount(0);
  });

  test("an Org Admin can open a workspace dossier, with catalog detail redacted", async ({ page }) => {
    await login(page, ORG_ADMIN);
    await page.goto(`/org/workspaces/${ACTIVE_TENANT_ID}`);

    await expect(page.getByRole("heading", { name: "E2E Active Co" })).toBeVisible({ timeout: 30_000 });
    // Oversight tier: counts are visible…
    await expect(page.getByText("Products (active)")).toBeVisible();
    // …but the confidential catalog product list (and its product names) is hidden.
    await expect(page.getByText("Managed Workstation")).toHaveCount(0);
  });

  test("an Org Admin cannot view a workspace outside their org (scope isolation)", async ({ page }) => {
    await login(page, ORG_ADMIN);
    // The EXPIRED tenant is standalone (not in this org) → the scoped route 404s.
    await page.goto(`/org/workspaces/${EXPIRED_TENANT_ID}`);

    await expect(page.getByText("E2E Expired Co")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible({ timeout: 30_000 });
  });

  test("a tenant user who is not an Org Admin is bounced off /org", async ({ page }) => {
    // OWNER owns a workspace but is not in organization_admins → /org redirects
    // them back to the app (their dashboard), never showing the org console.
    await login(page, OWNER);
    await page.goto("/org");

    await expect(page).not.toHaveURL(/\/org/, { timeout: 30_000 });
    await expect(page.getByText("Org Admin", { exact: true })).toHaveCount(0);
  });
});
