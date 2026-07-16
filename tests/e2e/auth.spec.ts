import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { OWNER } from "./config";

test.describe("authentication", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("owner can log in and reach the dashboard", async ({ page }) => {
    await login(page, OWNER);
    // Past all gates (MFA / access / legal) -> on the dashboard, not bounced
    // to /account/* or /auth/*.
    await expect(page).not.toHaveURL(/\/account\/|\/auth\/mfa|\/login/);
    // Sidebar greets the user by full name with a time-of-day greeting
    // ("Good morning/afternoon/evening, Eve Owner").
    await expect(
      page.getByText(/Good (morning|afternoon|evening), Eve Owner/i)
    ).toBeVisible();
  });

  test("invalid credentials show an error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", OWNER.email);
    await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid|credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
