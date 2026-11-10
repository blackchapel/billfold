import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test("F1 a non-allowlisted account is rejected", async ({ page }) => {
  await signIn(page, "stranger@example.com");
  await expect(page).toHaveURL(/not-authorised/);
  await expect(page.getByRole("heading", { name: /not authorised/i })).toBeVisible();
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/sign-in/);
});

test("F2 super admin manages the allowlist", async ({ page }) => {
  await signIn(page, "root@example.com");
  await expect(page).toHaveURL(/onboarding/);
  await page.goto("/admin");
  for (const email of ["owner@example.com", "member@example.com"]) {
    await page.getByLabel("Google account email").fill(email);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  }
  await page.getByLabel("Google account email").fill("temp@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("temp@example.com")).toBeVisible();
  await page.locator("li", { hasText: "temp@example.com" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("temp@example.com")).toHaveCount(0);
});

test("F3 admin page is hidden from non-super-admins", async ({ page }) => {
  await signIn(page, "owner@example.com");
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
});

test("F4 owner creates an org, invites a member who joins by code, and roles are enforced", async ({ browser, page }) => {
  await signIn(page, "owner@example.com");
  await page.getByLabel("Organisation name").fill("Sharma Home");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page).toHaveURL(/\/sharma-home$/);
  await expect(page.getByRole("heading", { name: "Sharma Home" })).toBeVisible();

  await page.getByRole("link", { name: "Invites" }).first().click();
  await page.getByLabel("Role").selectOption("member");
  await page.getByRole("button", { name: "Create invite code" }).click();
  const code = (await page.getByTestId("invite-code").textContent())?.trim();
  expect(code).toMatch(/^[A-Z2-9]{12}$/);

  const ctx = await browser.newContext();
  const member = await ctx.newPage();
  await signIn(member, "member@example.com");
  await member.getByLabel("Invite code").fill("WRONGCODE123");
  await member.getByRole("button", { name: "Join with code" }).click();
  await expect(member.getByText("That invite code is not valid.")).toBeVisible();
  await member.getByLabel("Invite code").fill(code!);
  await member.getByRole("button", { name: "Join with code" }).click();
  await expect(member).toHaveURL(/\/sharma-home$/);

  // A Member cannot manage invites or see the audit log, even by URL.
  await member.goto("/sharma-home/invites");
  await expect(member.getByText("You do not have permission to manage invites.")).toBeVisible();
  await member.goto("/sharma-home/audit");
  await expect(member.getByText("You do not have permission to view the audit log.")).toBeVisible();

  // Owner promotes the member to viewer; the role shows.
  await page.goto("/sharma-home/members");
  const row = page.locator("li", { hasText: "member@example.com" });
  await row.getByLabel("Role", { exact: true }).selectOption("viewer");
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row.getByText("viewer", { exact: true }).first()).toBeVisible();
  await ctx.close();
});

test("F5 a user in two orgs can switch and unknown orgs redirect home", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/onboarding");
  await page.getByLabel("Organisation name").fill("Side Project");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page).toHaveURL(/side-project$/);
  await page.getByRole("complementary").getByRole("link", { name: "Sharma Home" }).click();
  await expect(page).toHaveURL(/sharma-home$/);
  await page.goto("/no-such-org");
  await expect(page).not.toHaveURL(/no-such-org/);
});

test("F6 signing out ends the session", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toBeVisible();
  await page.goto("/sharma-home");
  await expect(page).toHaveURL(/sign-in/);
});

test("F7 removing someone from the allowlist locks them out immediately", async ({ browser, page }) => {
  const ctx = await browser.newContext();
  const user = await ctx.newPage();
  await signIn(user, "member@example.com");
  await user.goto("/sharma-home");
  await expect(user).toHaveURL(/sharma-home/);
  await signIn(page, "root@example.com");
  await page.goto("/admin");
  await page.locator("li", { hasText: "member@example.com" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("region", { name: "Who can sign in" }).getByText("member@example.com")).toHaveCount(0);
  await user.goto("/sharma-home");
  await expect(user).toHaveURL(/sign-in/);
  await ctx.close();
});

test("F8 health endpoint requires the cron secret", async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(401);
  const ok = await request.get("/api/health", { headers: { authorization: "Bearer test-cron-secret-123456" } });
  expect(ok.status()).toBe(200);
});
