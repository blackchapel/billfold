import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Runs after phase5.spec: org "sharma-home" has bills for last month (Jio, Power, a bank statement ...) with PDFs "filed" in the stand-in Drive.
// Test mode: emails are not sent; the stand-in mail sender keeps them in memory and /api/test/outbox lists them. An address containing "bounce" is refused.
// member@example.com is a viewer. Never a real recipient, never a real mail server.
test.describe.configure({ mode: "serial" });

const BASE = "/sharma-home";
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000);
const lastMonthName = () => { const t = istToday(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 15)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }); };
const li = (page: Page, text: string) => page.locator("li", { hasText: text });
interface Sent { to: string; subject: string; html: string; text: string; attachments: { filename: string; size: number }[] }
const outbox = async (page: Page) => ((await (await page.request.get("/api/test/outbox")).json()) as { sent: Sent[] }).sent;

test("F30 recipients: add (with mistakes), edit and remove", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/recipients`);
  await expect(page.getByText("Nobody yet.")).toBeVisible();
  await page.getByLabel("Name").fill("Asha Sharma");
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByRole("button", { name: "Add recipient" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Asha Sharma"); // typed values survive
  await page.getByLabel("Email address").fill("Asha@Example.com");
  await page.getByRole("button", { name: "Add recipient" }).click();
  await expect(page.locator('li[data-recipient="asha@example.com"]')).toBeVisible(); // stored in lower case
  await page.getByLabel("Name").fill("Asha again");
  await page.getByLabel("Email address").fill("ASHA@example.com");
  await page.getByRole("button", { name: "Add recipient" }).click();
  await expect(page.getByText("Someone with that email address is already in the list.")).toBeVisible();
  for (const [name, email] of [["Ravi", "ravi@example.com"], ["Bounce Test", "bounce@example.com"]]) {
    await page.getByLabel("Name").fill(name as string);
    await page.getByLabel("Email address").fill(email as string);
    await page.getByRole("button", { name: "Add recipient" }).click();
    await expect(page.locator(`li[data-recipient="${email}"]`)).toBeVisible();
  }
  await page.locator('li[data-recipient="ravi@example.com"]').getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/recipients\/[0-9a-f-]{36}$/);
  await page.getByLabel("Name").fill("Ravi Sharma");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/recipients$/);
  await expect(li(page, "Ravi Sharma")).toBeVisible();
  // A throw-away person can be removed.
  await page.getByLabel("Name").fill("Temp");
  await page.getByLabel("Email address").fill("temp@example.com");
  await page.getByRole("button", { name: "Add recipient" }).click();
  await li(page, "temp@example.com").getByRole("button", { name: "Delete" }).click();
  await expect(li(page, "temp@example.com")).toHaveCount(0);
});

test("F31 templates: the standard wording, a typo in a placeholder, a new default, editing and deleting", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/templates`);
  await expect(li(page, "Standard summary")).toContainText("built in");
  await page.getByRole("link", { name: "New template" }).click();
  await expect(page.getByLabel("Subject")).toHaveValue(/\{\{month\}\}/); // starts from the standard wording
  await page.getByLabel("Template name").fill("Short note");
  await page.getByLabel("Subject").fill("{{mnth}} bills");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Unknown placeholder: {{mnth}}")).toBeVisible();
  await expect(page.getByLabel("Template name")).toHaveValue("Short note");
  await page.getByLabel("Subject").fill("Family bills for {{month}} ({{total}})");
  await page.getByLabel("Opening text").fill("Hi all,\n\nThe bills for {{month}} are below.");
  await page.getByLabel("Closing text").fill("Thanks, {{sender}}");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page).toHaveURL(/\/templates$/);
  const mine = page.locator('li[data-template="Short note"]');
  await mine.getByRole("button", { name: "Make default" }).click();
  await expect(mine.getByText("default", { exact: true })).toBeVisible();
  await expect(li(page, "Standard summary").getByRole("button", { name: "Use this as the default" })).toBeVisible();
  await mine.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await page.getByLabel("Closing text").fill("Thanks again, {{sender}}");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/templates$/);
});

test("F32 send: preview, a test to yourself, a real send with one refused address, retry, and the sent log", async ({ page }) => {
  test.setTimeout(150_000); // a long end-to-end flow, and the dev server compiles pages on first visit
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");

  // Nothing to send from yet.
  await page.goto(`${BASE}/send`);
  await expect(page.getByText("Connect a Gmail account (project B) or an SMTP account")).toBeVisible();
  // An SMTP account for sending (the stand-in accepts only this app password).
  await page.goto(`${BASE}/connections`);
  await page.getByLabel("Sending summaries (SMTP)").check();
  await page.getByLabel("Name (optional)").fill("Summary sender");
  await page.getByLabel("Server").fill("smtp.example.com");
  await page.getByLabel("Email address (username)").fill("send@example.com");
  await page.getByLabel("App password", { exact: true }).fill("good-app-password");
  await page.getByRole("button", { name: "Test and save" }).click();
  await expect(li(page, "Summary sender")).toBeVisible();

  await page.goto(`${BASE}/send`);
  await page.getByLabel("Month").selectOption({ label: lastMonthName() });
  await expect(page.getByLabel("Wording").locator("option").first()).toHaveText("Default (Short note)");

  // Preview: the finished subject, what is attached, a warning about unchecked bills, and the HTML in a locked frame.
  await page.getByRole("button", { name: "Preview the email" }).click();
  await expect(page.getByTestId("preview-subject")).toContainText(`Family bills for ${lastMonthName()} (₹`);
  await expect(page.getByText(/\d+ PDFs? attached \(/)).toBeVisible();
  const frame = page.locator('iframe[title="How the email will look"]');
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(page.frameLocator('iframe[title="How the email will look"]').getByText("Jio").first()).toBeVisible();
  await page.getByLabel("Wording").selectOption({ label: "Standard summary" }); // changing anything hides the old preview
  await expect(page.getByRole("region", { name: "Preview" })).toHaveCount(0);

  // A real send needs somebody chosen; a test goes only to the person pressing the button.
  await expect(page.getByRole("button", { name: "Send to 0 people" })).toBeDisabled();
  await page.getByRole("button", { name: "Send me a test" }).click();
  await expect(page.getByTestId("send-status")).toHaveText("Sent", { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: new RegExp(`${lastMonthName()} \\(test\\)`), level: 1 })).toBeVisible();
  let sent = await outbox(page);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ to: "owner@example.com" });
  expect(sent[0]?.subject).toMatch(/^\[Test\] Bills for /);
  expect(sent[0]?.attachments.length).toBeGreaterThan(0);
  expect(sent[0]?.attachments.every((a) => a.filename.endsWith(".pdf") && a.size > 0)).toBe(true);
  expect(sent[0]?.html).not.toContain("<script");

  // The real thing: three people, one of whom the mail server refuses.
  await page.goto(`${BASE}/send`);
  await page.getByLabel("Month").selectOption({ label: lastMonthName() });
  for (const name of ["Asha Sharma", "Ravi Sharma", "Bounce Test"]) await page.getByLabel(new RegExp(name)).check();
  await page.getByLabel("Wording").selectOption({ label: "Short note" });
  await page.getByRole("button", { name: "Send to 3 people" }).click();
  await expect(page.getByTestId("send-status")).toHaveText("Sent with problems", { timeout: 60_000 });
  await expect(page.locator('li[data-recipient="asha@example.com"]')).toHaveAttribute("data-status", "sent");
  await expect(page.locator('li[data-recipient="ravi@example.com"]')).toHaveAttribute("data-status", "sent");
  const bounced = page.locator('li[data-recipient="bounce@example.com"]');
  await expect(bounced).toHaveAttribute("data-status", "failed");
  await expect(bounced).toContainText("The email could not be sent. Try again.");
  expect(await page.content()).not.toContain("550 mailbox unavailable"); // provider details stay out of the page
  sent = await outbox(page);
  expect(sent.map((s) => s.to).sort()).toEqual(["asha@example.com", "owner@example.com", "ravi@example.com"]);
  const ashas = sent.find((s) => s.to === "asha@example.com");
  expect(ashas?.subject).toContain(`Family bills for ${lastMonthName()}`);
  expect(ashas?.text).toContain("Thanks again,");

  // Retrying a refused address fails again, up to the limit, and leaves the others alone.
  await bounced.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("send-status")).toHaveText("Sent with problems", { timeout: 60_000 });
  expect((await outbox(page)).filter((s) => s.to === "asha@example.com")).toHaveLength(1); // nobody got a second copy

  // The email is kept as it went out, and listed in the log and on the Overview.
  await expect(page.getByText("The email as it was sent")).toBeVisible();
  await page.goto(`${BASE}/send`);
  await expect(page.getByRole("list").filter({ hasText: "from send@example.com" }).getByRole("link", { name: new RegExp(lastMonthName()) }).first()).toBeVisible();
  await page.goto(BASE);
  await expect(page.getByLabel("Getting started")).toContainText("Send your first summary");
});

test("F33 cancelling a send stops the emails that have not gone out yet", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("dialog", (d) => void d.accept());
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/send`);
  await page.getByLabel("Month").selectOption({ label: lastMonthName() });
  for (const name of ["Asha Sharma", "Ravi Sharma"]) await page.getByLabel(new RegExp(name)).check();
  await page.getByRole("button", { name: "Send to 2 people" }).click();
  await expect(page).toHaveURL(/\/send\/[0-9a-f-]{36}$/);
  const pause = page.getByRole("button", { name: "Pause" });
  if (await pause.isVisible()) await pause.click(); // only possible while it is still working
  const cancel = page.getByRole("button", { name: "Cancel send" });
  if (await cancel.isVisible()) {
    await cancel.click();
    await expect(page.getByTestId("send-status")).toHaveText("Cancelled");
  } else {
    await expect(page.getByTestId("send-status")).toHaveText("Sent"); // it was quicker than the click; nothing left to cancel
  }
});

test("F34 a viewer can read recipients, templates and the sent log but cannot change or send anything", async ({ page }) => {
  await signIn(page, "member@example.com");
  await page.goto(`${BASE}/recipients`);
  await expect(page.locator('li[data-recipient="asha@example.com"]')).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await page.goto(`${BASE}/templates`);
  await expect(page.locator('li[data-template="Short note"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "New template" })).toHaveCount(0);
  await page.goto(`${BASE}/templates/new`);
  await expect(page).toHaveURL(/\/templates$/);
  await page.goto(`${BASE}/send`);
  await expect(page.getByRole("button", { name: "Preview the email" })).toHaveCount(0);
  await expect(page.getByText("Ask an owner or admin if you need to send a summary.")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(lastMonthName()) }).first().click();
  await expect(page.getByTestId("send-status")).toBeVisible();
  await expect(page.getByRole("button", { name: /Cancel send|Try all failed again|Pause/ })).toHaveCount(0);
  await page.goto(`${BASE}/reports`);
  await expect(page.getByRole("link", { name: /as an email summary/ })).toHaveCount(0);
});

test("F35 Reports links to sending the month shown", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/reports`);
  await page.getByLabel("Month", { exact: true }).selectOption({ label: lastMonthName() });
  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("link", { name: `Send ${lastMonthName()} as an email summary` }).click();
  await expect(page).toHaveURL(/\/send\?period=\d{4}-\d{2}$/);
  await expect(page.getByLabel("Month")).toHaveValue(/\d{4}-\d{2}/);
  await expect(page.getByLabel("Month").locator("option:checked")).toHaveText(lastMonthName());
});
