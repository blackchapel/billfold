import { randomBytes } from "node:crypto";
import { CACHE_TAGS, type CacheTag, type CacheVersions } from "@/domain/ports/cache";

export const versionKey = (orgId: string, tag: CacheTag) => `v:${orgId}:${tag}`;

/**
 * A version is a unique token (time plus randomness), never a counter. A counter that was lost (evicted, expired, reset) would start
 * again from 1 and could match an old cached screen that is still alive; a unique token can never repeat.
 */
export const newVersion = () => `${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;

/** As long as the copies they guard (see READ_MODEL_TTL_SECONDS). */
export const VERSION_TTL_SECONDS = 35 * 24 * 3600;

export function toVersions(tokens: (string | null)[]): CacheVersions | null {
  if (tokens.length !== CACHE_TAGS.length || tokens.some((t) => t === null)) return null;
  return Object.fromEntries(CACHE_TAGS.map((tag, i) => [tag, tokens[i] as string])) as CacheVersions;
}
