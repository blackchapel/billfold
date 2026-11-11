export const APP_NAME = "Billfold";
export const INVITE_CODE_LENGTH = 12;
export const DEFAULT_CURRENCY = "INR";
export const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Top-level URL segments that an org slug must never take, because a route already uses them. */
export const RESERVED_SLUGS = ["admin", "api", "auth", "sign-in", "not-authorised", "onboarding", "privacy", "terms", "settings", "app", "billfold", "test-skeleton"] as const;

/** Orgs live in India for now: month boundaries use UTC+5:30 (no daylight saving). */
export const ORG_UTC_OFFSET_MINUTES = 330;
