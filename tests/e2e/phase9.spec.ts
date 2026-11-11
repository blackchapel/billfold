import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signIn } from "./helpers";

// Runs after phase8.spec: org "sharma-home" has the "Old mailbox" and the Drive drive@example.com; member@example.com is a viewer.
// Test mode: the stand-in Drive records every upload and /api/test/drive lists them; Google's grant is full Drive access.
test.describe.configure({ mode: "serial" });

const BASE = "/sharma-home";
const DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/billfold_test";
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000);
const lastMonth = () => { const t = istToday(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 15)); };
const short = () => lastMonth().toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const yy = () => String(lastMonth().getUTCFullYear()).slice(2);
const longName = () => lastMonth().toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
interface Upload { folderPath: string[]; fileName: string; size: number }
const uploads = async (page: Page) => ((await (await page.request.get("/api/test/drive")).json()) as { uploads: Upload[] }).uploads;
const forgetCache = (page: Page) => page.request.post("/api/test/cache");

async function addSource(page: Page, o: { name: string; folder?: string; file?: string }) {
  await page.goto(`${BASE}/sources/new`);
  await page.getByLabel("Name", { exact: true }).fill(o.name);
  await page.getByLabel("Read from mailbox").selectOption({ label: "Old mailbox (old@example.com)" });
  await page.getByLabel("Sent by").fill("jio.com");
  await page.getByLabel(/in brackets at the end/).check();
  if (o.folder) await page.getByLabel("Folder path").fill(o.folder);
  if (o.file) await page.getByLabel("File name").fill(o.file);
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
}
async function addRunConfig(page: Page, name: string, source: string) {
  await page.goto(`${BASE}/run-configs/new`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel(source, { exact: true }).check();
  await page.getByLabel("File the PDFs in this Google Drive").selectOption({ label: "drive@example.com" });
  await page.getByLabel("Drive folder name").fill("Test Bills");
  await page.getByRole("button", { name: "Save run configuration" }).click();
  await expect(page).toHaveURL(/run-configs$/);
}
async function startRun(page: Page, config: string) {
  await page.goto(`${BASE}/runs`);
  await page.getByLabel("Run configuration").selectOption({ label: config });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
}

test("F45 a source files under its own folder path and file name, with a live example and clear mistakes", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/sources/new`);
  await page.getByLabel("Name", { exact: true }).fill("Phone bill");
  await page.getByLabel("Folder path").fill("bills/{{Mnth}}");
  await expect(page.getByText("Unknown placeholder: {{Mnth}}")).toBeVisible();
  await expect(page.getByText("Fix the problem above to see an example.")).toBeVisible();
  await page.getByLabel("Folder path").fill("bills/{{MON}}{{yy}}");
  await page.getByLabel("File name").fill("phone-bill_xxxx-{{Mon}}{{yy}}");
  await expect(page.getByTestId("filing-preview")).toHaveText(`bills / ${short().toUpperCase()}${yy()} / phone-bill_xxxx-${short()}${yy()}.pdf`);
  await page.getByLabel("File name").fill("phone/bill");
  await expect(page.getByText("A file name cannot contain a slash.")).toBeVisible();
  await page.getByLabel("File name").fill("phone-bill_xxxx-{{mon}}{{yy}}");
  await expect(page.getByTestId("filing-preview")).toContainText(`phone-bill_xxxx-${short().toLowerCase()}${yy()}.pdf`);
  await page.getByLabel("File name").fill("phone-bill_xxxx-{{Mon}}{{yy}}");

  // The server checks too: a bad value that is saved anyway is refused with the same words, and what was typed stays.
  await page.getByLabel("Read from mailbox").selectOption({ label: "Old mailbox (old@example.com)" });
  await page.getByLabel("Sent by").fill("jio.com");
  await page.getByLabel(/in brackets at the end/).check();
  await page.getByLabel("File name").fill("phone/bill");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A file name cannot contain a slash." }).first()).toBeVisible();
  await expect(page).toHaveURL(/sources\/new$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Phone bill");
  await page.getByLabel("File name").fill("phone-bill_xxxx-{{Mon}}{{yy}}");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
  await addRunConfig(page, "Phone run", "Phone bill");
  await startRun(page, "Phone run");
  await expect(page.getByRole("heading", { name: "Finished", level: 2 })).toBeVisible({ timeout: 60_000 });
  const last = (await uploads(page)).at(-1);
  expect(last).toMatchObject({ folderPath: ["bills", `${short().toUpperCase()}${yy()}`], fileName: `phone-bill_xxxx-${short()}${yy()}.pdf` });

  // Editing shows what was saved, and clearing the fields goes back to the standard layout.
  await page.goto(`${BASE}/sources`);
  await page.locator("li", { hasText: "Phone bill" }).getByRole("link", { name: "Edit and test" }).click();
  await expect(page.getByLabel("Folder path")).toHaveValue("bills/{{MON}}{{yy}}");
  await expect(page.getByLabel("File name")).toHaveValue("phone-bill_xxxx-{{Mon}}{{yy}}");
});

test("F46 a Drive connected before full access was asked for says so, refuses folder paths, and Reconnect fixes it", async ({ page }) => {
  test.setTimeout(150_000);
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await addSource(page, { name: "Phone two", folder: "bills/{{Month}}", file: "second-{{Mon}}" });
  await addRunConfig(page, "Phone two run", "Phone two");
  const sql = postgres(DB, { max: 1, prepare: false });
  await sql`update connections set config = '{}'::jsonb where kind = 'google_drive'`; // as every connection made before this change
  await sql.end();
  await forgetCache(page);

  await page.goto(`${BASE}/connections`);
  const drive = page.locator("li", { hasText: "drive@example.com" });
  await expect(drive.getByText("needs more permission")).toBeVisible();
  await expect(drive.getByText(/press Reconnect and allow access to your Drive/)).toBeVisible();
  const before = (await uploads(page)).length;
  await startRun(page, "Phone two run");
  await expect(page.getByRole("heading", { name: "Finished with problems", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/needs more permission on the Google Drive/)).toBeVisible();
  expect((await uploads(page)).length).toBe(before); // nothing was put in a second, look-alike folder

  await page.goto(`${BASE}/connections`);
  await drive.getByRole("link", { name: "Reconnect" }).click();
  await expect(page).toHaveURL(/connections\?connected=1/);
  await expect(page.locator("li", { hasText: "drive@example.com" }).getByText("needs more permission")).toHaveCount(0);
});

test("F47 a bill typed in by hand can carry its document, filed in a Drive folder under the name it has", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/bills/new`);
  await page.getByLabel("Biller").fill("Water works");
  await page.getByLabel("Amount (₹)").fill("450");
  await page.getByLabel("Month", { exact: true }).selectOption({ label: longName() });
  await page.locator('input[type="file"]').setInputFiles({ name: "Water bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% a tiny test document\n") });
  await page.getByLabel("Folder", { exact: true }).fill("bills/{{Mon}}{{yy}}");
  await expect(page.getByTestId("upload-preview")).toHaveText(`bills / ${short()}${yy()} / Water bill.pdf`);

  // A file that is not a PDF or picture is refused, and nothing typed is lost.
  await page.locator('input[type="file"]').setInputFiles({ name: "program.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 not a pdf") });
  await page.getByRole("button", { name: "Add bill" }).click();
  await expect(page.getByText("Only PDF files and pictures (PNG, JPG or WebP) can be attached.")).toBeVisible();
  await expect(page.getByLabel("Biller")).toHaveValue("Water works");
  await expect(page.getByLabel("Folder", { exact: true })).toHaveValue("bills/{{Mon}}{{yy}}");

  // Too big is caught on the screen before anything is sent.
  await page.locator('input[type="file"]').setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024)]) });
  await expect(page.getByText("That file is larger than 4 MB. Choose a smaller one.")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "Water bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% a tiny test document\n") });
  await page.getByRole("button", { name: "Add bill" }).click();
  await expect(page).toHaveURL(/\/bills$/);
  expect((await uploads(page)).at(-1)).toMatchObject({ folderPath: ["bills", `${short()}${yy()}`], fileName: "Water bill.pdf" });
  const row = page.locator('tbody tr[data-bill="Water works"]');
  await expect(row.getByRole("link", { name: "Open in Drive" })).toBeVisible();
});

test("F48 a change made in one session shows at once in another, for lists, roles and the allowlist", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signIn(page, "owner@example.com");
  const other = await browser.newContext({ baseURL: "http://localhost:3100" });
  const second = await other.newPage();
  await signIn(second, "owner@example.com");
  await second.goto(`${BASE}/recipients`); // filled the cache
  await second.goto(`${BASE}/recipients`);
  await expect(second.locator('li[data-recipient="cache@example.com"]')).toHaveCount(0);
  await page.goto(`${BASE}/recipients`);
  await page.getByLabel("Name").fill("Cache Tester");
  await page.getByLabel("Email address").fill("cache@example.com");
  await page.getByRole("button", { name: "Add recipient" }).click();
  await expect(page.locator('li[data-recipient="cache@example.com"]')).toBeVisible();
  await second.reload();
  await expect(second.locator('li[data-recipient="cache@example.com"]')).toBeVisible();

  // A role change reaches the person at once: the viewer gains the form and loses it again.
  const viewer = await browser.newContext({ baseURL: "http://localhost:3100" });
  const v = await viewer.newPage();
  await signIn(v, "member@example.com");
  await v.goto(`${BASE}/recipients`);
  await expect(v.getByLabel("Email address")).toHaveCount(0);
  const setRole = async (role: string) => {
    await page.goto(`${BASE}/members`);
    const row = page.locator("li", { hasText: "member@example.com" });
    await row.getByLabel("Role", { exact: true }).selectOption(role);
    await row.getByRole("button", { name: "Save", exact: true }).click();
    await expect(row.getByText(role, { exact: true }).first()).toBeVisible();
  };
  await setRole("admin");
  await v.goto(`${BASE}/recipients`);
  await expect(v.getByLabel("Email address")).toBeVisible();
  await setRole("viewer");
  await v.goto(`${BASE}/recipients`);
  await expect(v.getByLabel("Email address")).toHaveCount(0);
  await viewer.close();
  await other.close();
});

test("F49 the owner can clear the cache from Settings; a viewer has no such button", async ({ page, browser }) => {
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/settings`);
  await expect(page.getByRole("heading", { name: "Cache", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Clear the cache" }).click();
  await expect(page.getByText("Cleared. Every screen now reads fresh data.")).toBeVisible();
  await page.goto(`${BASE}/recipients`);
  await expect(page.locator('li[data-recipient="cache@example.com"]')).toBeVisible(); // still all there, simply read afresh

  const viewer = await browser.newContext({ baseURL: "http://localhost:3100" });
  const v = await viewer.newPage();
  await signIn(v, "member@example.com");
  await v.goto(`${BASE}/settings`);
  await expect(v.getByRole("button", { name: "Clear the cache" })).toHaveCount(0);
  await viewer.close();
});

test("F50 the test-only endpoints answer in test mode", async ({ request }) => {
  // In production they answer 404 (the stand-ins do not exist there); here they must work, or the other flows could not look inside.
  expect((await request.get("/api/test/drive")).status()).toBe(200);
  expect((await request.get("/api/test/outbox")).status()).toBe(200);
  expect((await request.post("/api/test/cache")).status()).toBe(200);
});

test("F51 Delete asks what to do: hide it for good, or remove it so the next run files the email again", async ({ page }) => {
  test.setTimeout(150_000); // a long end-to-end flow
  await signIn(page, "owner@example.com");
  const row = (biller: string) => page.locator(`tbody tr[data-bill="${biller}"]`);
  await page.goto(`${BASE}/bills`);

  // A bill typed in by hand has no email to file again, so the dialog offers a single plain delete.
  await page.goto(`${BASE}/bills/new`);
  await page.getByLabel("Biller").fill("Typed F51");
  await page.getByLabel("Amount (₹)").fill("10");
  await page.getByRole("button", { name: "Add bill" }).click();
  await expect(page).toHaveURL(/\/bills$/);
  await row("Typed F51").getByRole("button", { name: "Delete", exact: true }).click();
  const plain = page.getByRole("dialog", { name: "Delete this bill?" });
  await expect(plain.getByRole("button", { name: "Delete and file it again next run" })).toHaveCount(0);
  await plain.getByRole("button", { name: "Keep the bill" }).click(); // cancelling changes nothing
  await expect(row("Typed F51")).toHaveCount(1);
  await row("Typed F51").getByRole("button", { name: "Delete", exact: true }).click();
  await plain.getByRole("button", { name: "Delete this bill", exact: true }).click();
  await expect(row("Typed F51")).toHaveCount(0);

  // A bill that came from an email: "file it again" removes it, and the next run files that email again.
  const before = await row("Power").count();
  await row("Power").first().getByRole("button", { name: "Delete", exact: true }).click();
  const choose = page.getByRole("dialog", { name: "Delete this bill?" });
  await choose.getByRole("button", { name: "Delete and file it again next run" }).click();
  await expect(row("Power")).toHaveCount(before - 1);
  await page.getByLabel("Show").selectOption("deleted");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(row("Power")).toHaveCount(0); // removed for good, not merely hidden
  await page.goto(`${BASE}/runs`);
  await page.getByLabel("Run configuration").selectOption({ label: "Everything" });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("heading", { name: "Finished", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/1 filed · 0 failed/)).toBeVisible();
  await page.goto(`${BASE}/bills`);
  await expect(row("Power")).toHaveCount(before);
});

test("F52 {{from_name}} in the wording is the name set on the account the email goes out from", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/templates/new`);
  await page.getByLabel("Template name").fill("Signed by account");
  await page.getByLabel("Closing text").fill("Sent by {{from_name}}");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page).toHaveURL(/\/templates$/);

  await page.goto(`${BASE}/connections`);
  const row = page.locator("li", { hasText: "Summary sender" });
  await row.getByText("Name on this account", { exact: false }).first().click();
  await row.getByLabel("Name on this account").fill("<b>Priya</b>");
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(row.getByText("cannot contain brackets")).toBeVisible();
  await row.getByLabel("Name on this account").fill("Priya Sharma");
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(row.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(row.getByText("Name on this account: Priya Sharma")).toBeVisible();

  await page.goto(`${BASE}/send`);
  await page.getByLabel("Month").selectOption({ index: 0 });
  await page.getByLabel("Wording").selectOption({ label: "Signed by account" });
  await page.getByRole("button", { name: "Preview the email" }).click();
  await expect(page.frameLocator('iframe[title="How the email will look"]').getByText("Sent by Priya Sharma")).toBeVisible();

  // Clearing the name falls back to the person pressing Send.
  await page.goto(`${BASE}/connections`);
  await row.getByText("Name on this account", { exact: false }).first().click();
  await row.getByLabel("Name on this account").fill("");
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(row.getByText("Saved.")).toBeVisible();
  await page.goto(`${BASE}/send`);
  await page.getByLabel("Month").selectOption({ index: 0 });
  await page.getByLabel("Wording").selectOption({ label: "Signed by account" });
  await page.getByRole("button", { name: "Preview the email" }).click();
  await expect(page.frameLocator('iframe[title="How the email will look"]').getByText(/Sent by (?!Priya)/)).toBeVisible();
});
