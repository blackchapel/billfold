/**
 * Test mode swaps Google sign-in for a cookie-based fake session so Playwright can run offline.
 * It can never be enabled in production: it requires a non-production NODE_ENV and no VERCEL_ENV.
 */
export function isTestMode(): boolean {
  return process.env.BILLFOLD_TEST_MODE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV;
}

export const TEST_SESSION_COOKIE = "billfold_test_user";
