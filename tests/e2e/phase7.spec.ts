import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Runs after phase6.spec. The first flows use a signed-out browser: these pages must work for anyone, with no session.
test.describe.configure({ mode: "serial" });

test("F36 the front page explains Billfold to a stranger and points at sign-in, privacy and terms", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Billfold: every bill, filed and summarised");
  await expect(page.getByRole("heading", { name: "Every bill, filed and summarised.", level: 1 })).toBeVisible();
  const steps = page.getByRole("region", { name: "How it works" }).getByRole("listitem");
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toContainText("Describe your bills once");
  await expect(page.getByRole("region", { name: "Your data stays yours" })).toContainText("never changes your mailbox");
  await expect(page.getByText("Invite-only, for families and small teams.")).toBeVisible();
  await page.getByRole("link", { name: "Sign in with Google" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText(/By signing in you agree to the terms/)).toBeVisible();
  await page.getByRole("link", { name: "privacy page" }).click();
  await expect(page).toHaveURL(/\/privacy$/, { timeout: 20_000 }); // the first visit compiles the page in the dev server
});

test("F37 the privacy policy and terms are public, complete and honest about Google data", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveTitle("Privacy Policy · Billfold");
  await expect(page.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeVisible();
  for (const heading of [
    "The short version", "1. Information Billfold collects", "2. How Billfold uses it", "3. What each Google permission is used for",
    "4. Google API Services User Data Policy (Limited Use)", "5. Who else handles the data", "6. How the data is protected",
    "7. Where it is stored, and for how long", "8. Your choices, access and deletion", "9. Cookies", "10. Children", "11. Changes to this policy", "12. Contact",
  ]) await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
  // Every Google permission is named, with what it is used for and when.
  const table = page.getByRole("region", { name: "Google permissions" });
  for (const scope of ["Sign in with Google", "Gmail, read-only (gmail.readonly)", "Gmail, send (gmail.send)", "Google Drive (drive)"]) await expect(table.getByRole("rowheader", { name: scope })).toBeVisible();
  await expect(table).toContainText("does not change, label, move or delete anything in your mailbox");
  await expect(table).toContainText("Only when someone presses Send");
  // Google's required statement and the promises that go with it.
  await expect(page.getByText("will adhere to the Google API Services User Data Policy").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Google API Services User Data Policy" })).toHaveAttribute("href", /developers\.google\.com\/terms\/api-services-user-data-policy/);
  await expect(page.getByText("including the Limited Use requirements")).toBeVisible();
  await expect(page.getByText("does not use this data to develop, improve or train generalized artificial-intelligence or machine-learning models")).toBeVisible();
  await expect(page.getByText("does not use this data for serving advertisements")).toBeVisible();
  // Every service that touches the data is named, including the cache.
  for (const who of ["Supabase.", "Vercel.", "Upstash.", "Google.", "Google Gemini (optional)."]) await expect(page.getByText(who, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Billfold does not sell personal information")).toBeVisible();
  await expect(page.getByText("Last updated 11 November 2026")).toBeVisible();
  // No contact address is configured in tests, so the page says to ask whoever invited you rather than showing a broken link.
  await expect(page.getByText("Ask the person who invited you")).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  // Readable without scripts, which is how a crawler reads it.
  expect(await page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(6000);

  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page).toHaveTitle("Terms of Service · Billfold");
  await expect(page.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "4. Please check the numbers", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2. What Billfold does with your Google account", level: 2 })).toBeVisible();
  await page.getByRole("link", { name: "Privacy Policy" }).first().click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.getByRole("contentinfo").getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("F37b a crawler that runs no scripts and sends no cookies gets the whole policy, not a login page", async ({ request }) => {
  const expected: Record<string, string[]> = {
    "/privacy": ["Gmail, read-only", "Limited Use", "Upstash", "Last updated"],
    "/terms": ["Terms of Service", "Please check the numbers", "Drive permission is broad"],
  };
  for (const path of ["/privacy", "/terms"]) {
    const res = await request.get(path, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    const html = await res.text();
    for (const text of expected[path] ?? []) expect(html, `${path} should contain "${text}"`).toContain(text);
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]+noindex/i);
  }
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /privacy");
  expect(robots).toContain("Allow: /terms");
});

test("F38 signed-in people reach the legal pages from inside the app too", async ({ page }) => {
  await signIn(page, "owner@example.com");
  await page.goto("/sharma-home");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await page.goto("/sharma-home");
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms$/);
});

test("F39 icons, social preview, manifest and robots are served", async ({ page }) => {
  await page.goto("/");
  const meta = (sel: string) => page.locator(sel).first().getAttribute("content");
  const og = await meta('meta[property="og:image"]');
  expect(og).toMatch(/opengraph-image/);
  expect(await meta('meta[property="og:title"]')).toBe("Billfold");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  const fetchOk = async (url: string, type: RegExp) => {
    const res = await page.request.get(url);
    expect(res.status(), url).toBe(200);
    expect(res.headers()["content-type"], url).toMatch(type);
    return res;
  };
  await fetchOk(new URL(og ?? "", "http://localhost:3100").pathname + new URL(og ?? "", "http://localhost:3100").search, /image\/png/);
  const apple = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute("href");
  await fetchOk(apple ?? "", /image\/png/);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const manifest = await (await fetchOk("/manifest.webmanifest", /json/)).json() as { name: string; icons: { src: string }[] };
  expect(manifest.name).toBe("Billfold");
  for (const icon of manifest.icons) await fetchOk(icon.src, /image\/png/);
  await fetchOk("/icon.svg", /svg/);
  const robots = await (await fetchOk("/robots.txt", /text\/plain/)).text();
  expect(robots).toContain("Disallow: /");
  expect(robots).toContain("Allow: /privacy");
});

test("F40 organisation settings: rename keeps the address, deleting needs the address typed and hides the organisation", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "owner@example.com");
  await page.goto("/onboarding");
  await page.getByLabel("Organisation name").fill("Throwaway Org");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await expect(page).toHaveURL(/\/throwaway-org$/);
  await page.goto("/throwaway-org/settings");
  await page.getByLabel("Organisation name", { exact: true }).fill("Throwaway Renamed");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("complementary").getByText("Throwaway Renamed")).toBeVisible();
  await expect(page.getByText("/throwaway-org")).toBeVisible(); // the address stays the same
  await page.getByLabel(/Type "throwaway-org" to confirm/).fill("wrong");
  await page.getByRole("button", { name: "Delete organisation" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/throwaway-org\/settings$/);
  const confirm = page.getByLabel(/Type "throwaway-org" to confirm/);
  await expect(confirm).toHaveValue(""); // React empties the field a moment after a refused attempt; type only after that
  await confirm.fill("throwaway-org");
  await page.getByRole("button", { name: "Delete organisation" }).click();
  await expect(page).not.toHaveURL(/throwaway-org/);
  await page.goto("/throwaway-org");
  await expect(page).not.toHaveURL(/throwaway-org/); // gone for its former owner too
  await expect(page.getByRole("complementary").getByText("Throwaway Renamed")).toHaveCount(0);
  await page.goto("/sharma-home");
  await expect(page.getByRole("heading", { name: "Sharma Home", level: 1 })).toBeVisible(); // other organisations are untouched
});
