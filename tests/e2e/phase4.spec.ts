import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Runs after phase2-3.spec: org "sharma-home" exists with the mailbox "Old mailbox"; member@example.com is a viewer (re-allowed there).
// Test mode: the mailbox holds a Jio bill (PDF locked with the password in the subject), a power bill (plain PDF), a newsletter
// that is itself a bill (email text), and a bank statement locked with the password "bank-pass-1". Drive is an in-memory stand-in.
test.describe.configure({ mode: "serial" });

const BASE = "/sharma-home";
const row = (page: Page, text: string) => page.locator("li", { hasText: text });

async function addSource(page: Page, opts: { name: string; senders: string; mode: RegExp; password?: string; attachment?: boolean }) {
  await page.goto(`${BASE}/sources/new`);
  await page.getByLabel("Name", { exact: true }).fill(opts.name);
  await page.getByLabel("Read from mailbox").selectOption({ label: "Old mailbox (old@example.com)" });
  await page.getByLabel("Sent by").fill(opts.senders);
  if (opts.attachment === false) await page.getByLabel("Only emails that have an attachment").uncheck();
  await page.getByLabel(opts.mode).check();
  if (opts.password) await page.getByLabel("PDF password").fill(opts.password);
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
  await expect(row(page, opts.name).first()).toBeVisible();
}

test("F18 switching tabs always works: slow, rapid, repeated and with back and forward", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto(BASE);
  const nav = page.getByRole("navigation", { name: "Main" });
  const tabs = [["Members", "members"], ["Connections", "connections"], ["Sources", "sources"], ["Run configs", "run-configs"], ["Runs", "runs"], ["Invites", "invites"], ["Audit log", "audit"], ["Settings", "settings"], ["Overview", ""]] as const;
  for (let round = 0; round < 3; round++) {
    for (const [label, path] of tabs) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${BASE}${path ? `/${path}` : ""}$`), { timeout: 8000 });
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      await expect(page.locator("main h1").first()).toBeVisible();
    }
  }
  // Rapid fire: click several tabs without waiting; the last click must win.
  await nav.getByRole("link", { name: "Members", exact: true }).click();
  await nav.getByRole("link", { name: "Sources", exact: true }).click();
  await nav.getByRole("link", { name: "Runs", exact: true }).click();
  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/settings$`), { timeout: 8000 });
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  // Back and forward.
  await page.goBack();
  await expect(page).not.toHaveURL(/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("F19 a change made on a page shows straight away, including in the header and the sidebar", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/settings`);
  await page.getByLabel("Organisation name").fill("Sharma Household");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Sharma Household").first()).toBeVisible(); // no reload needed
  await expect(page.getByRole("banner").getByText("Sharma Household")).toBeVisible();
  await page.getByLabel("Organisation name").fill("Sharma Home");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("banner").getByText("Sharma Home", { exact: true })).toBeVisible();
});

test("F20 the overview guides a new set-up and shows the latest run", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}`);
  const guide = page.getByRole("region", { name: "Getting started" });
  await expect(guide.getByRole("link", { name: /1\. Connect a mailbox and a Google Drive/ })).toBeVisible();
  await expect(guide.locator("li", { hasText: "Start your first run" }).getByText("to do")).toBeVisible();
  await expect(page.getByRole("region", { name: "Latest run" })).toHaveCount(0);
});

test("F21 a run collects a month of bills: locked PDFs opened, amounts read, files put in Drive, one wrong password reported", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto("/sharma-home/connections");
  await page.getByRole("link", { name: "Connect Google Drive" }).click();
  await expect(page.getByText("Connected.")).toBeVisible();

  await addSource(page, { name: "Jio", senders: "jio.com", mode: /in brackets at the end/ });
  await addSource(page, { name: "Bank", senders: "bank.example", mode: /Same password every time/, password: "bank-pass-1" });
  await addSource(page, { name: "Bank typo", senders: "bank.example", mode: /Same password every time/, password: "wrong-pass" });
  await addSource(page, { name: "Power", senders: "powerco.example", mode: /Not password protected/, attachment: false });

  await page.goto(`${BASE}/run-configs/new`);
  await page.getByLabel("Name", { exact: true }).fill("Everything");
  for (const name of ["Jio", "Bank", "Bank typo", "Power"]) await page.getByLabel(name, { exact: true }).check();
  await page.getByLabel("File the PDFs in this Google Drive").selectOption({ label: "drive@example.com" });
  await page.getByLabel("Drive folder name").fill("Test Bills");
  await page.getByRole("button", { name: "Save run configuration" }).click();
  await expect(page).toHaveURL(/run-configs$/);

  await page.goto(`${BASE}/runs`);
  await page.getByLabel("Run configuration").selectOption({ label: "Everything" });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);

  // The screen files the items one by one on its own and ends with the verdict.
  await expect(page.getByRole("heading", { name: "Finished with problems", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("4 filed · 1 failed · 0 skipped · 0 waiting")).toBeVisible();
  const jio = row(page, "Your Jio bill is ready ([redacted])");
  await expect(jio.getByText("₹1,234.50")).toBeVisible();
  await expect(jio.getByText(/due 15 Dec 2026/)).toBeVisible();
  await expect(jio.getByText("Filed", { exact: true })).toBeVisible();
  await expect(jio.getByRole("link", { name: "Open in Drive" })).toHaveAttribute("href", /^https:\/\/drive\.test\/file\//);
  await expect(row(page, "Electricity bill November").getByText("₹2,310.00")).toBeVisible();
  await expect(row(page, "Our newsletter").getByText("₹99.00")).toBeVisible();
  await expect(row(page, "Bank").filter({ hasText: "Filed" }).getByText("₹5,000.00")).toBeVisible();
  const typo = row(page, "Bank typo");
  await expect(typo.getByText("Failed", { exact: true })).toBeVisible();
  await expect(typo.getByText("The password did not open this PDF. Check the source's PDF setting.")).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(/abc123|bank-pass-1|wrong-pass/);

  // Fix the password, then retry only what failed.
  await page.goto(`${BASE}/sources`);
  await row(page, "Bank typo").getByRole("link", { name: "Edit and test" }).click();
  await page.getByLabel("PDF password").fill("bank-pass-1");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
  await page.goto(`${BASE}/runs`);
  await page.locator("main ul a").first().click();
  await page.getByRole("button", { name: "Try all failed again" }).click();
  await expect(page.getByRole("heading", { name: "Finished", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("5 filed · 0 failed · 0 skipped · 0 waiting")).toBeVisible();

  // Running the same month again files nothing twice.
  await page.goto(`${BASE}/runs`);
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("heading", { name: "Finished", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("0 filed · 0 failed · 5 skipped · 0 waiting")).toBeVisible();
  await expect(page.getByText("Already filed in an earlier run.").first()).toBeVisible();

  // The overview now shows the latest run and ticks off the guide.
  await page.goto(BASE);
  await expect(page.getByRole("region", { name: "Latest run" })).toContainText("5 skipped");
  await expect(page.getByRole("region", { name: "Getting started" }).locator("li", { hasText: "Start your first run" }).getByText("done")).toBeVisible();
});

test("F22 a run can be paused and cancelled; what was filed stays and the rest is skipped", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await addSource(page, { name: "Jio again", senders: "jio.com", mode: /in brackets at the end/ });
  await addSource(page, { name: "Power again", senders: "powerco.example", mode: /Not password protected/, attachment: false });
  await page.goto(`${BASE}/run-configs/new`);
  await page.getByLabel("Name", { exact: true }).fill("Second");
  await page.getByLabel("Jio again").check();
  await page.getByLabel("Power again").check();
  await page.getByLabel("File the PDFs in this Google Drive").selectOption({ label: "drive@example.com" });
  await page.getByRole("button", { name: "Save run configuration" }).click();
  await expect(page).toHaveURL(/run-configs$/);

  // Slow every filing step down so there is time to press Pause and Cancel.
  await page.route(/\/runs\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${BASE}/runs`);
  await page.getByLabel("Run configuration").selectOption({ label: "Second" });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused")).toBeVisible();
  await page.getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByRole("heading", { name: "Cancelled", level: 2 })).toBeVisible({ timeout: 30_000 });
  const text = await page.locator("main").innerText();
  expect(text).toMatch(/(\d+) skipped/);
  expect(text).toContain("Run cancelled before this was filed.");
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
});

test("F23 viewers can read runs but cannot start, retry, cancel or process them", async ({ browser }) => {
  const ctx = await browser.newContext();
  const viewer = await ctx.newPage();
  await signIn(viewer, "member@example.com");
  await viewer.goto(`${BASE}/runs`);
  await expect(viewer.getByRole("button", { name: "Start run" })).toHaveCount(0);
  await expect(viewer.getByRole("heading", { name: "Recent runs" })).toBeVisible();
  await viewer.locator("main li a").first().click();
  await expect(viewer.locator("main h1")).toBeVisible();
  await expect(viewer.getByRole("button", { name: /Pause|Cancel run|Try all failed again/ })).toHaveCount(0);
  await ctx.close();
});
