import { defineConfig } from "@playwright/test";

const PORT = 3100;
const DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/billfold_test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "verify-report/artifacts",
  reporter: [["list"], ["html", { outputFolder: "verify-report/html", open: "never" }]],
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    // Optional: point at an already-installed Chromium (e.g. CI image) instead of Playwright's download.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      DATABASE_URL: DB,
      MASTER_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      SUPER_ADMIN_EMAILS: "root@example.com",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
      CRON_SECRET: "test-cron-secret-123456",
      BILLFOLD_TEST_MODE: "1",
    },
  },
});
