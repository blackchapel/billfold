import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const VIEWPORTS = [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1280, height: 800 }];
const SCHEMES = ["light", "dark"] as const;
const OWNER_PAGES = ["/sharma-home", "/sharma-home/members", "/sharma-home/connections", "/sharma-home/sources", "/sharma-home/sources/new", "/sharma-home/run-configs", "/sharma-home/run-configs/new", "/sharma-home/runs", "/sharma-home/invites", "/sharma-home/audit", "/sharma-home/settings", "/onboarding"];
const ADMIN_PAGES = ["/admin"];
const PUBLIC_PAGES = ["/", "/sign-in", "/not-authorised"];

// Runs after flows.spec (file order): org "sharma-home" and the owner exist, root is the super admin.
test("V1 every page: no console errors, no overflow, no axe violations, screenshots in light/dark and phone/desktop", async ({ browser }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  for (const scheme of SCHEMES) for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? "")) errors.push(`request failed ${r.url()}`); });
    const check = async (path: string) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const name = `${scheme}-${vp.name}-${path.replace(/\W+/g, "_") || "home"}`;
      await page.screenshot({ path: `verify-report/screenshots/${name}.png`, fullPage: true });
      expect(page.url(), `${name} should not bounce to another page`).toContain(path === "/" ? "/" : path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) problems.push(`${name}: horizontal overflow`);
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      for (const v of axe.violations) problems.push(`${name}: axe ${v.id} (${v.nodes.length})`);
    };
    for (const path of PUBLIC_PAGES) await check(path);
    await signIn(page, "owner@example.com");
    for (const path of OWNER_PAGES) await check(path);
    await ctx.clearCookies();
    await signIn(page, "root@example.com");
    for (const path of ADMIN_PAGES) await check(path);
    problems.push(...errors.filter((e) => !/favicon|example\.supabase\.co/.test(e)).map((e) => `${scheme}-${vp.name}: ${e}`));
    await ctx.close();
  }
  expect(problems).toEqual([]);
});
