import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Runs after phase4.spec: org "sharma-home" has filed bills for last month (Jio, Power, a newsletter, two bank statements) and
// the Drive and mailbox connections. member@example.com is a viewer. Dates below are relative to "today" in India time.
test.describe.configure({ mode: "serial" });

const BASE = "/sharma-home";
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(istToday().getTime() + n * 86_400_000));
const monthName = (d: Date) => d.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const lastMonth = () => { const t = istToday(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 15)); };
// Earlier flows left bills such as "Jio again", so match the biller exactly rather than by a piece of its text.
const row = (page: Page, biller: string) => page.locator(`tbody tr[data-bill="${biller}"]`);

async function addManual(page: Page, f: { biller: string; amount: string; due?: string }) {
  await page.goto(`${BASE}/bills/new`);
  await page.getByLabel("Biller").fill(f.biller);
  await page.getByLabel("Amount (₹)").fill(f.amount);
  if (f.due) await page.getByLabel("Due date (optional)").fill(f.due);
  await page.getByRole("button", { name: "Add bill" }).click();
  await expect(page).toHaveURL(/\/bills$/);
}

test("F24 a bill the reader was unsure about is flagged, corrected and checked by a person", async ({ page }) => {
  await signIn(page, "owner@example.com");
  // A source for scanned statements: the stub mailbox's scan has no text, so no amount can be read.
  await page.goto(`${BASE}/sources/new`);
  await page.getByLabel("Name", { exact: true }).fill("Scans");
  await page.getByLabel("Read from mailbox").selectOption({ label: "Old mailbox (old@example.com)" });
  await page.getByLabel("Sent by").fill("scanco.example");
  await page.getByLabel(/Not password protected/).check();
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page).toHaveURL(/sources$/);
  await page.goto(`${BASE}/run-configs/new`);
  await page.getByLabel("Name", { exact: true }).fill("Scans run");
  await page.getByLabel("Scans", { exact: true }).check();
  await page.getByLabel("File the PDFs in this Google Drive").selectOption({ label: "drive@example.com" });
  await page.getByRole("button", { name: "Save run configuration" }).click();
  await expect(page).toHaveURL(/run-configs$/);
  await page.goto(`${BASE}/runs`);
  await page.getByLabel("Run configuration").selectOption({ label: "Scans run" });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("heading", { name: "Finished", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("needs review")).toBeVisible();

  // The overview and the bills page both point at it.
  await page.goto(BASE);
  await expect(page.getByLabel("Bills to check")).toContainText("1 bill needs a check.");
  await page.getByRole("link", { name: "Review it" }).click();
  await expect(page).toHaveURL(/filter=review/);
  const scan = row(page, "Scans");
  await expect(scan.getByText("needs a check")).toBeVisible();
  await expect(scan.getByText("not known")).toBeVisible();
  await expect(page.getByText(/a scan, so please enter the amount|scan/i).first()).toBeVisible();

  // Correct it: typed values survive a mistake, then the real amount is saved and the bill is marked checked.
  await scan.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("I have checked this bill against the original")).toBeChecked();
  await page.getByLabel("Amount (₹)").fill("six hundred");
  await page.getByLabel("Due date (optional)").fill(inDays(20));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter the amount as a number, for example 1234.50.")).toBeVisible();
  await expect(page.getByLabel("Due date (optional)")).toHaveValue(inDays(20));
  await page.getByLabel("Amount (₹)").fill("₹1,640.50");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/bills$/);
  const fixed = row(page, "Scans");
  await expect(fixed.getByText("₹1,640.50")).toBeVisible();
  await expect(fixed.getByText("needs a check")).toHaveCount(0);
  await expect(page.getByText("need a check")).toHaveCount(0);
  await page.goto(BASE);
  await expect(page.getByLabel("Bills to check")).toHaveCount(0);
});

test("F25 a bill can be added by hand, and mistakes keep what was typed", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/bills/new`);
  await page.getByLabel("Biller").fill("Maid");
  await page.getByLabel("Amount (₹)").fill("abc");
  await page.getByLabel("Note (optional)").fill("Cash, paid on the 1st");
  await page.getByRole("button", { name: "Add bill" }).click();
  await expect(page.getByText("Enter the amount as a number, for example 1234.50.")).toBeVisible();
  await expect(page.getByLabel("Biller")).toHaveValue("Maid");
  await expect(page.getByLabel("Note (optional)")).toHaveValue("Cash, paid on the 1st");
  await page.getByLabel("Amount (₹)").fill("3,000.50");
  await page.getByLabel("Due date (optional)").fill(inDays(3));
  await page.getByRole("button", { name: "Add bill" }).click();
  await expect(page).toHaveURL(/\/bills$/);
  const maid = row(page, "Maid");
  await expect(maid.getByText("₹3,000.50")).toBeVisible();
  await expect(maid.getByText("added by hand")).toBeVisible();
  await expect(maid.getByText("Cash, paid on the 1st")).toBeVisible();
  await expect(maid.getByText("unpaid", { exact: true })).toBeVisible();
  // A bill cannot belong to a month that has not started.
  await page.goto(`${BASE}/bills/new`);
  await expect(page.getByLabel("Month").locator("option").first()).toHaveText(monthName(istToday()));
});

test("F26 paying, deleting and restoring; a deleted bill's email is not filed again", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/bills`);
  const maid = row(page, "Maid");
  await maid.getByRole("button", { name: "Mark paid" }).click();
  await expect(maid.getByText("paid", { exact: true })).toBeVisible();
  await page.getByLabel("Show").selectOption("unpaid");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(row(page, "Maid")).toHaveCount(0);
  await expect(row(page, "Jio")).toBeVisible();
  await page.goto(`${BASE}/bills`);
  await row(page, "Maid").getByRole("button", { name: "Mark unpaid" }).click();
  await expect(row(page, "Maid").getByText("unpaid", { exact: true })).toBeVisible();

  // Delete a bill that came from an email, then run the same month again: it must not come back.
  await row(page, "Power").first().getByRole("button", { name: "Delete" }).click();
  await expect(row(page, "Power")).toHaveCount(0);
  await page.goto(`${BASE}/runs`);
  await page.getByLabel("Run configuration").selectOption({ label: "Everything" });
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByRole("heading", { name: "Finished", level: 2 })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("0 filed · 0 failed · 5 skipped · 0 waiting")).toBeVisible();
  await page.goto(`${BASE}/bills`);
  await expect(row(page, "Power")).toHaveCount(0);

  await page.getByLabel("Show").selectOption("deleted");
  await page.getByRole("button", { name: "Apply" }).click();
  const gone = row(page, "Power");
  await expect(gone.getByText("deleted", { exact: true })).toBeVisible();
  await expect(gone.getByRole("link", { name: "Edit" })).toHaveCount(0); // a deleted bill must be restored before it is changed
  await gone.getByRole("button", { name: "Restore" }).click();
  await expect(row(page, "Power")).toHaveCount(0);
  await page.goto(`${BASE}/bills`);
  await expect(row(page, "Power")).toBeVisible();
});

test("F27 search, filters and the CSV download", async ({ page, browser }) => {
  await signIn(page, "owner@example.com");
  await addManual(page, { biller: '=HYPERLINK("http://evil.example","click")', amount: "10" });
  await page.getByLabel("Search").fill("maid");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=maid/);
  await expect(row(page, "Maid")).toBeVisible();
  await expect(row(page, "Jio")).toHaveCount(0);
  await page.getByLabel("Search").fill("");
  const last = monthName(lastMonth()).replace(/ .*/, "");
  await page.getByLabel("Month").selectOption({ label: monthName(lastMonth()) });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(row(page, "Maid")).toHaveCount(0); // added this month
  await expect(row(page, "Jio")).toBeVisible();
  expect(last.length).toBeGreaterThan(2);

  // CSV: the same bills, safe for spreadsheets, only for signed-in members.
  const res = await page.request.get(`${BASE}/bills/export`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toBe('attachment; filename="billfold-bills-all.csv"');
  expect(res.headers()["cache-control"]).toContain("no-store");
  const csv = await res.text();
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("Month,Biller,Source,Amount,Currency,Bill date,Due date,Paid,Needs review,Read by,Note,Drive link");
  expect(csv).toMatch(/Maid,Added by hand,3000\.50,INR,/);
  expect(csv).toMatch(/Jio,Jio,1234\.50,INR/);
  expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`); // defused, and quoted because of its commas and quotes
  expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  const scoped = await page.request.get(`${BASE}/bills/export?filter=unpaid&q=maid`);
  const lines = (await scoped.text()).trim().split("\r\n");
  expect(lines).toHaveLength(2);
  expect(scoped.headers()["content-disposition"]).toBe('attachment; filename="billfold-bills-all.csv"');

  const stranger = await browser.newContext();
  const anon = await stranger.request.get(`http://localhost:3100${BASE}/bills/export`);
  expect(anon.headers()["content-type"] ?? "").not.toContain("text/csv");
  expect(await anon.text()).not.toContain("Maid");
  await stranger.close();
});

test("F28 reports: month totals, a 12 month chart you can hover and read as a table, insights and due lists", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await addManual(page, { biller: "Gas", amount: "850", due: inDays(-2) }); // overdue
  await page.goto(`${BASE}/reports`);
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  const insights = page.getByRole("list", { name: "Things to know" });
  await expect(insights).toContainText("past the due date and not marked paid");
  await expect(insights).toContainText("due in the next 7 days");
  await expect(page.getByRole("region", { name: "Overdue" }).getByText("Gas")).toBeVisible();
  await expect(page.getByRole("region", { name: "Overdue" }).getByText("2 days overdue")).toBeVisible();
  await expect(page.getByRole("region", { name: "Due in the next 7 days" }).getByText("Maid")).toBeVisible();

  // Pick last month, where the run filed bills.
  await page.getByLabel("Month").selectOption({ label: monthName(lastMonth()) });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/period=\d{4}-\d{2}/);
  await expect(page.getByText(`Total for ${monthName(lastMonth())}`)).toBeVisible();
  const table = page.getByRole("region", { name: "Bills by biller" });
  await expect(table.getByRole("row", { name: /Jio/ })).toContainText("₹1,234.50");
  await expect(table.getByRole("row", { name: /Power/ })).toContainText("₹2,310.00");
  await expect(table.getByRole("row", { name: /Bank/ }).first()).toContainText("₹5,000.00");

  // The chart: twelve columns, each a link; hover and keyboard focus show the same tooltip; the table holds every number.
  const chart = page.getByRole("group", { name: "Total of bills per month, last 12 months" });
  await expect(chart.getByRole("link")).toHaveCount(12);
  const selected = chart.getByRole("link", { name: new RegExp(`^${monthName(lastMonth())}:`) });
  await expect(selected).toHaveAttribute("aria-current", "true");
  await selected.hover();
  await expect(page.getByRole("tooltip")).toContainText(monthName(lastMonth()));
  await expect(page.getByRole("tooltip")).toContainText(/₹[\d,]+\.\d\d/);
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await chart.getByRole("link").nth(3).focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.getByText("Show as a table").click();
  await expect(page.getByRole("table", { name: "Total of bills per month" }).locator("tbody tr")).toHaveCount(12);
  // Clicking a column opens that month.
  await chart.getByRole("link").nth(11).click();
  await expect(page).toHaveURL(/period=\d{4}-\d{2}/);
  await expect(page.getByText(`Total for ${monthName(istToday())}`)).toBeVisible();
});

test("F29 viewers can read bills and reports and download the CSV, but not change anything", async ({ browser }) => {
  const ctx = await browser.newContext();
  const viewer = await ctx.newPage();
  await signIn(viewer, "member@example.com");
  await viewer.goto(`${BASE}/bills`);
  await expect(row(viewer, "Jio")).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Add a bill" })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /Mark paid|Mark unpaid|Delete|Mark checked/ })).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Download CSV" })).toBeVisible();
  await viewer.goto(`${BASE}/bills/new`);
  await expect(viewer).toHaveURL(/\/bills$/);
  await viewer.goto(`${BASE}/reports`);
  await expect(viewer.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  const csv = await viewer.request.get(`${BASE}/bills/export`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  await ctx.close();
});
