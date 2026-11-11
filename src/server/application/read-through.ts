import { createHash } from "node:crypto";
import type { Cache, CacheTag, CacheVersions } from "@/domain/ports/cache";

/** A screen's data is remembered for at most this long even if nobody changes anything: the safety net under the versions. */
/**
 * Pages are used about once a month, so a copy has to outlive the gap between visits. 35 days, not 30, so a visit on day 31 still hits.
 * Staleness is not the TTL's job: saving data gives it a new version, so an old copy is never read again.
 */
export const READ_MODEL_TTL_SECONDS = 35 * 24 * 3600;

/**
 * Returns what `load` returns, remembering it under a key that contains the version of every kind of data it was built from (`tags`).
 * Saving any of that data gives it a new version, so the old entry is never read again.
 *
 * `versions` must have been fetched BEFORE this call (and so before the database is asked): a slow reader that finishes after a save
 * stores its answer under the old versions, where nobody will look, and can never overwrite fresher data. With no cache, or no versions
 * (cache down), this is just `load()`. A failing cache never fails the read.
 */
export async function readThrough<T>(
  cache: Cache, versions: CacheVersions | null, orgId: string, name: string, tags: readonly CacheTag[], args: unknown, load: () => Promise<T>,
): Promise<T> {
  if (!cache.enabled || !versions) return load();
  const stamp = tags.map((t) => versions[t]).join("-");
  const key = `rm:${orgId}:${name}:${stamp}:${createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex").slice(0, 16)}`;
  const hit = await cache.get<T>(key);
  if (hit) return hit.value;
  const fresh = await load();
  await cache.set(key, fresh, READ_MODEL_TTL_SECONDS);
  return fresh;
}
