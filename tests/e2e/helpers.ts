import type { Page } from "@playwright/test";

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Test user email").fill(email);
  await page.getByRole("button", { name: "Sign in as test user" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}
