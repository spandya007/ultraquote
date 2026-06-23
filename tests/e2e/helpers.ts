import { type Page } from "@playwright/test";

interface Creds { email: string; password: string }

// Log in through the real login form and wait until we've navigated off /login.
// Destination-agnostic: a healthy owner lands on the dashboard, but a gated user
// (expired/suspended) is redirected to /account/* — callers assert where they end up.
export async function login(page: Page, user: Creds) {
  await page.goto("/login");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}
