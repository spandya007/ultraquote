import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { OWNER } from "./config";

test.describe("quote authoring", () => {
  test("create a quote, add a catalog line item, and preview", async ({ page }) => {
    await login(page, OWNER);

    // Unique title so the test is re-runnable without reseeding the DB (the
    // create route rejects duplicate titles within a tenant). Matters in UI
    // mode, where globalSetup doesn't re-run between individual re-runs.
    const title = `E2E Smoke ${Date.now()}`;

    // New Quote modal -> pick the seeded client + title -> create.
    await page.goto("/quotes");
    await page.getByRole("button", { name: "New Quote" }).first().click();
    await page
      .locator('select:has(option:has-text("Select a client"))')
      .selectOption({ index: 1 }); // 1 = the seeded Globex client (0 = placeholder)
    await page.getByPlaceholder("e.g. Managed Services Proposal").fill(title);

    // Create, then wait for the POST to finish (without reading its body —
    // reading a captured response body is flaky in UI mode). Navigate into the
    // editor via the list row, since the modal's client-side push is flaky.
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/quotes") && r.request().method() === "POST" && r.ok()
      ),
      page.getByRole("button", { name: "Create Quote" }).click(),
    ]);
    await page.goto("/quotes");
    await page.getByRole("row", { name: new RegExp(title) }).click();

    // Editor ready when the catalog button renders (heavy route compiles on
    // first hit in dev — allow extra time).
    await page.waitForURL(/\/quotes\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Add from catalog" })).toBeVisible({ timeout: 30_000 });

    // Add the seeded catalog product via the spotlight search.
    await page.getByRole("button", { name: "Add from catalog" }).click();
    await page.getByPlaceholder("Search products…").fill("Managed");
    await page.getByRole("button", { name: /Managed Workstation/ }).click();

    // Line item landed: its $75 unit price flows into the computed totals.
    await expect(page.getByText("$75.00").first()).toBeVisible({ timeout: 10_000 });

    // Preview opens the proposal modal for this quote.
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/Preview —/)).toBeVisible({ timeout: 15_000 });
  });
});
