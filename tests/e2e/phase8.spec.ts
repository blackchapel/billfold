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

test("F42 every skeleton bar shimmers on its own with transform only, the gaps between bars stay still, and reduced motion stops it", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await page.goto("/test-skeleton");
  const bars = page.locator(".skeleton");
  const count = await bars.count();
  expect(count).toBeGreaterThan(10);
  await expect(page.locator(".shimmer")).toHaveCount(0); // no overlay across the whole frame

  // One animation per bar, on the bar's own highlight, moving nothing but transform; the bar clips it.
  const animations = await page.evaluate(() => document.getAnimations()
    .filter((a) => (a as CSSAnimation).animationName === "skeleton-wave")
    .map((a) => {
      const effect = a.effect as KeyframeEffect;
      const props = effect.getKeyframes().flatMap((k) => Object.keys(k)).filter((p) => !["offset", "easing", "composite", "computedOffset"].includes(p));
      return { pseudo: effect.pseudoElement, onBar: (effect.target as Element).classList.contains("skeleton"), props: [...new Set(props)] };
    }));
  expect(animations).toHaveLength(count);
  for (const a of animations) expect(a).toEqual({ pseudo: "::after", onBar: true, props: ["transform"] });
  expect(await page.evaluate(() => [...document.querySelectorAll(".skeleton")].every((el) => getComputedStyle(el).overflow === "hidden"))).toBe(true);

  // Pixels over a few sweeps: the empty space beside the title bar never changes; the title bar itself does.
  const box = await bars.first().boundingBox();
  if (!box) throw new Error("the first skeleton bar has no box");
  const gap = { x: box.x + box.width + 16, y: box.y, width: 120, height: box.height };
  const inside = { x: box.x, y: box.y, width: box.width, height: box.height };
  const gaps: Buffer[] = [];
  const insides: Buffer[] = [];
  for (let i = 0; i < 8; i++) {
    gaps.push(await page.screenshot({ clip: gap }));
    insides.push(await page.screenshot({ clip: inside }));
    await page.waitForTimeout(200);
  }
  expect(gaps.every((g) => g.equals(gaps[0] as Buffer))).toBe(true); // the highlight never leaves its bar
  expect(insides.some((b) => !b.equals(insides[0] as Buffer))).toBe(true); // and the bar really does shimmer

  const calm = await browser.newContext({ reducedMotion: "reduce", baseURL: "http://localhost:3100" });
  const cp = await calm.newPage();
  await cp.goto("/test-skeleton");
  expect(await cp.locator(".skeleton").count()).toBe(count);
  expect(await cp.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === "skeleton-wave").length)).toBe(0);
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
