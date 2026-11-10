import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// Runs after flows.spec (file order): org "sharma-home" exists, owner@example.com owns it, member@example.com is a viewer.
// Test mode swaps Google and the mail servers for offline stand-ins; "good-app-password" is the only password they accept.
test.describe.configure({ mode: "serial" });

const CONNECTIONS = "/sharma-home/connections";
const DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/billfold_test";
async function breakConnection(account: string) {
  const sql = postgres(DB, { max: 1, prepare: false });
  await sql`update connections set status = 'needs_attention', last_error = 'The server rejected the username or app password.' where account_email = ${account}`;
  await sql.end();
}
const row = (page: Page, text: string) => page.locator("li", { hasText: text });

test("F9 mail accounts: a wrong app password is refused, a right one is saved, tested, updated and shown without secrets", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto(CONNECTIONS);
  await page.getByLabel("Name (optional)").fill("Family inbox");
  await page.getByLabel("Server").fill("imap.example.com");
  await page.getByLabel("Email address (username)").fill("bills@example.com");
  await page.getByLabel("App password").fill("wrong-one");
  await page.getByRole("button", { name: "Test and save" }).click();
  await expect(page.getByText("The server rejected the username or app password.")).toBeVisible();
  await expect(page.getByText("Nothing is linked yet.")).toBeVisible();

  await page.getByLabel("App password").fill("good-app-password");
  await page.getByRole("button", { name: "Test and save" }).click();
  const inbox = row(page, "Family inbox");
  await expect(inbox).toBeVisible();
  await expect(inbox.getByText("working")).toBeVisible();
  expect(await page.content()).not.toContain("good-app-password");

  await inbox.getByRole("button", { name: "Test", exact: true }).click();
  await expect(inbox.getByText("Test mode: connection is fine.")).toBeVisible();

  await inbox.getByText("Update app password").click();
  await inbox.getByLabel("New app password").fill("nope");
  await inbox.getByRole("button", { name: "Test and replace" }).click();
  await expect(inbox.getByText("The server rejected the username or app password.")).toBeVisible();
  await inbox.getByLabel("New app password").fill("good-app-password");
  await inbox.getByRole("button", { name: "Test and replace" }).click();
  await expect(inbox.getByText("Updated.")).toBeVisible();
});

test("F10 Google Drive: connect round trip, reconnect keeps one row, health sweep reports it healthy", async ({ page, request }) => {
  await signIn(page, "owner@example.com");
  await page.goto(CONNECTIONS);
  await page.getByRole("link", { name: "Connect Google Drive" }).click();
  await expect(page).toHaveURL(/connections\?connected=1/);
  await expect(page.getByText("Connected.")).toBeVisible();
  const drive = row(page, "drive@example.com");
  await expect(drive.getByText("Google Drive")).toBeVisible();
  await drive.getByRole("link", { name: "Reconnect" }).click();
  await expect(page.getByText("Connected.")).toBeVisible();
  await expect(row(page, "drive@example.com")).toHaveCount(1);

  expect((await request.get("/api/cron/connections")).status()).toBe(401);
  const sweep = await request.get("/api/cron/connections", { headers: { authorization: "Bearer test-cron-secret-123456" } });
  expect(sweep.status()).toBe(200);
  expect(await sweep.json()).toMatchObject({ ok: true, checked: 2, failing: 0, skipped: 0 });
});

test("F11 a forged or replayed Google connect callback is refused", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/api/connections/google/callback?code=x&state=forged.value");
  await expect(page).toHaveURL(/\/(onboarding|sharma-home)/);
  await page.goto("/sharma-home/connections");
  await expect(row(page, "mailbox@example.com")).toHaveCount(0);
});

test("F12 sources: create with a Jio-style subject password, test it against the mailbox, edit, and validation messages", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/sharma-home/sources");
  await page.getByRole("link", { name: "New source" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Jio");
  await page.getByLabel("Read from mailbox").selectOption({ label: "Family inbox (bills@example.com)" });
  await page.getByLabel("Sent by").fill("not an email");
  await page.getByLabel("Subject contains (optional)").fill("bill");
  await page.getByLabel(/in brackets at the end/).check();
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByText(/is not an email address or a domain/)).toBeVisible();

  await page.getByLabel("Sent by").fill("jio.com");
  await page.getByRole("button", { name: "Test against mailbox" }).click();
  const results = page.getByRole("region", { name: "Test results" });
  await expect(results.getByRole("heading", { name: "1 matching email" })).toBeVisible();
  await expect(results.getByText("Your Jio bill is ready ([redacted])")).toBeVisible();
  await expect(results.getByText("Password found in the subject.")).toBeVisible();
  expect(await page.content()).not.toContain("abc123");

  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
  const jio = row(page, "Jio");
  await expect(jio.getByText("reads Family inbox")).toBeVisible();
  await expect(jio.getByText(/Jio style/)).toBeVisible();

  await jio.getByRole("link", { name: "Edit and test" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Jio");
  await expect(page.getByLabel("Sent by")).toHaveValue("@jio.com");
  await page.getByLabel("Name", { exact: true }).fill("Jio mobile");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(row(page, "Jio mobile")).toBeVisible();
});

test("F13 a static PDF password is saved encrypted and never shown again; a duplicate name is refused", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/sharma-home/sources/new");
  await page.getByLabel("Name", { exact: true }).fill("Bank statement");
  await page.getByLabel("Read from mailbox").selectOption({ label: "Family inbox (bills@example.com)" });
  await page.getByLabel("Sent by").fill("bank@example.com");
  await page.getByLabel(/Same password every time/).check();
  await page.getByLabel("PDF password").fill("super-secret-pdf-pass");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
  await expect(row(page, "Bank statement")).toBeVisible();
  expect(await page.content()).not.toContain("super-secret-pdf-pass");

  await row(page, "Bank statement").getByRole("link", { name: "Edit and test" }).click();
  await expect(page.getByLabel("PDF password")).toHaveAttribute("placeholder", /Saved/);
  expect(await page.content()).not.toContain("super-secret-pdf-pass");

  await page.goto("/sharma-home/sources/new");
  await page.getByLabel("Name", { exact: true }).fill("bank STATEMENT");
  await page.getByLabel("Read from mailbox").selectOption({ label: "Family inbox (bills@example.com)" });
  await page.getByLabel("Sent by").fill("x@example.com");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByText("A source with that name already exists.")).toBeVisible();
});

test("F14 run configurations need a Drive and sources, and protect what they use", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto("/sharma-home/run-configs/new");
  await page.getByLabel("Name", { exact: true }).fill("Monthly household bills");
  await page.getByLabel("File the PDFs in this Google Drive").selectOption({ label: "drive@example.com" });
  await page.getByRole("button", { name: "Save run configuration" }).click();
  await expect(page.getByText("Choose at least one source.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Monthly household bills"); // typed values survive an error
  await page.getByLabel("Jio mobile").check();
  await page.getByLabel("Bank statement").check();
  await page.getByLabel("Drive folder name").fill("Family Bills");
  await page.getByLabel("This calendar month").check();
  await page.getByRole("button", { name: "Save run configuration" }).click();
  await expect(page).toHaveURL(/run-configs$/);
  const monthly = row(page, "Monthly household bills");
  await expect(monthly.getByText("This calendar month")).toBeVisible();
  await expect(monthly.getByText("Files into “Family Bills” on drive@example.com")).toBeVisible();
  await expect(monthly.getByText("Sources: Bank statement, Jio mobile")).toBeVisible();

  // The Drive and the mailbox are in use, so Connections refuses to remove them and says why.
  await page.goto(CONNECTIONS);
  await row(page, "drive@example.com").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText('This connection is used by run config "Monthly household bills"')).toBeVisible();
  await row(page, "Family inbox").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(/This connection is used by source/)).toBeVisible();
  await expect(row(page, "drive@example.com")).toHaveCount(1);
});

test("F15 viewers can look but not change connections, sources or run configurations", async ({ browser, page }) => {
  await signIn(page, "root@example.com");
  await page.goto("/admin");
  await page.getByLabel("Google account email").fill("member@example.com");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("member@example.com", { exact: true })).toBeVisible();

  const ctx = await browser.newContext();
  const viewer = await ctx.newPage();
  await signIn(viewer, "member@example.com");
  await viewer.goto(CONNECTIONS);
  await expect(row(viewer, "drive@example.com")).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Test and save" })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Connect Google Drive" })).toHaveCount(0);
  await viewer.goto("/sharma-home/sources");
  await expect(row(viewer, "Jio mobile")).toBeVisible();
  await expect(viewer.getByRole("link", { name: "New source" })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Edit and test" })).toHaveCount(0);
  await viewer.goto("/sharma-home/sources/new");
  await expect(viewer).toHaveURL(/sources$/);
  await viewer.goto("/sharma-home/run-configs/new");
  await expect(viewer).toHaveURL(/run-configs$/);
  await expect(viewer.getByRole("button", { name: "Delete" })).toHaveCount(0);
  // Direct calls to the start route are refused too.
  await viewer.goto("/api/connections/google/start?org=sharma-home&kind=google_drive");
  await expect(viewer).toHaveURL(/connections\?error=/);
  await ctx.close();
});

test("F16 after the dependants are deleted the connections can be removed", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto("/sharma-home/run-configs");
  await row(page, "Monthly household bills").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No run configurations yet.")).toBeVisible();
  await page.goto("/sharma-home/sources");
  for (const name of ["Jio mobile", "Bank statement"]) {
    await row(page, name).getByRole("button", { name: "Delete" }).click();
    await expect(row(page, name)).toHaveCount(0);
  }
  await page.goto(CONNECTIONS);
  await row(page, "drive@example.com").getByRole("button", { name: "Remove" }).click();
  await expect(row(page, "drive@example.com")).toHaveCount(0);
  await row(page, "Family inbox").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Nothing is linked yet.")).toBeVisible();
});

test("F17 the overview warns when a connection needs attention, and a passing test clears it", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto(CONNECTIONS);
  await page.getByLabel("Name (optional)").fill("Old mailbox");
  await page.getByLabel("Server").fill("imap.example.com");
  await page.getByLabel("Email address (username)").fill("old@example.com");
  await page.getByLabel("App password").fill("good-app-password");
  await page.getByRole("button", { name: "Test and save" }).click();
  await expect(row(page, "Old mailbox").getByText("working")).toBeVisible();
  await page.goto("/sharma-home");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

  await breakConnection("old@example.com");
  await page.goto("/sharma-home");
  await expect(page.locator("main").getByRole("alert")).toContainText("A connection needs attention");
  await expect(page.locator("main").getByRole("alert")).toContainText("Old mailbox");
  await page.goto(CONNECTIONS);
  await expect(row(page, "Old mailbox").getByText("needs attention")).toBeVisible();
  await row(page, "Old mailbox").getByRole("button", { name: "Test", exact: true }).click();
  await expect(row(page, "Old mailbox").getByText("working")).toBeVisible();
  await page.goto("/sharma-home");
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
