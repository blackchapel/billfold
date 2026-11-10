import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Runs after phase7.spec: org "sharma-home" exists and owner@example.com owns it.
// These flows make the server slow on purpose, the way a busy database or a cold start does, and check that pressing a button
// always shows something at once and ends on the right page without a reload.
test.describe.configure({ mode: "serial" });

const BASE = "/sharma-home";

/** Delays only the page-data requests the app makes when a link is pressed (they carry the RSC header), not the first page load. */
async function slowNavigation(page: Page, ms: number) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.headers()["rsc"] === "1" && req.resourceType() === "fetch") await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

const CASES = [
  { from: "sources", button: "New source", heading: "New source" },
  { from: "run-configs", button: "New run configuration", heading: /New run configuration/ },
  { from: "bills", button: "Add a bill", heading: /Add a bill/ },
  { from: "templates", button: "New template", heading: "New template" },
] as const;

for (const c of CASES) {
  test(`F41 "${c.button}" answers at once on a slow server and opens without a reload`, async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page, "owner@example.com");
    await page.goto(`${BASE}/${c.from}`);
    await slowNavigation(page, 2500);
    const link = page.getByRole("link", { name: c.button });
    await link.click();
    // Within a moment, while the server is still thinking, the pressed link shows a spinner. (The page skeleton comes from the
    // production prefetch, which the dev server used by these tests does not do; F42 checks the skeleton on its own page.)
    await expect(link.locator(".spinner")).toBeVisible({ timeout: 1500 });
    await expect(page).toHaveURL(new RegExp(`${c.from}/new$`), { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: c.heading, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".spinner")).toHaveCount(0);
  });
}

test("F42 the loading skeleton shimmers with transform only, and stands still for people who ask for less motion", async ({ page, browser }) => {
  await page.goto("/test-skeleton");
  await expect(page.locator(".shimmer")).toHaveCount(2);
  const animated = await page.evaluate(() => document.getAnimations()
    .filter((a) => (a as CSSAnimation).animationName === "shimmer")
    .map((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k)).filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p))));
  expect(animated).toHaveLength(2); // one moving band per skeleton, however many blocks it has
  for (const props of animated) expect([...new Set(props)]).toEqual(["transform"]);
  await expect(page.getByRole("status")).toHaveCount(2);
  await expect(page.getByRole("status").first()).toContainText("Loading…");

  const calm = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const cp = await calm.newPage();
  await cp.goto("/test-skeleton");
  await expect(cp.locator(".shimmer")).toHaveCount(2);
  expect(await cp.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === "shimmer").length)).toBe(0);
  await calm.close();
});

test("F43 a page that is very slow says so instead of looking frozen", async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, "owner@example.com");
  await page.goto(`${BASE}/templates`);
  await slowNavigation(page, 9000);
  await page.getByRole("link", { name: "New template" }).click();
  await expect(page.getByText("Still loading… reload the page if nothing happens.")).toBeVisible({ timeout: 9000 });
  await expect(page.getByRole("heading", { name: "New template", level: 1 })).toBeVisible({ timeout: 20_000 });
});

test("F44 tabs and links on every list page answer at once on a slow server", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "owner@example.com");
  await page.goto(BASE);
  await slowNavigation(page, 1500);
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const [label, path] of [["Sources", "sources"], ["Reports", "reports"], ["Send", "send"], ["Recipients", "recipients"], ["Members", "members"]] as const) {
    const tab = nav.getByRole("link", { name: label });
    await tab.click();
    await expect(tab.locator(".spinner")).toBeVisible({ timeout: 1200 });
    await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 10_000 });
  }
});
