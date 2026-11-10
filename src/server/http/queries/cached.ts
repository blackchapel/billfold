import "server-only";
import { cache as perRequest } from "react";
import type { CacheTag } from "@/domain/ports/cache";
import { createHash } from "node:crypto";
import { container } from "../../composition-root/container";

/** A screen's data is remembered for at most this long even if nobody changes anything: the safety net under the versions. */
const READ_MODEL_TTL_SECONDS = 300;

/** The versions of every tag for an organisation, fetched once per page render (one round trip serves every read model on the page). */
const versionsOnce = perRequest((orgId: string) => container().cache.versions(orgId));

/**
 * Returns what `load` returns, remembering it in the shared cache under a key that contains the current version of every kind of
 * data it was built from (`tags`). Saving any of that data gives it a new version, so the old entry is never read again.
 *
 * The versions are read BEFORE the database is asked: a slow reader that finishes after a save stores its answer under the old
 * versions, where nobody will look, and can never overwrite fresher data. If the cache is absent, slow or down this is just `load()`.
 * Only for data that is the same for everyone in the organisation: never put per-person or secret data through here.
 */
export async function cachedRead<T>(orgId: string, name: string, tags: readonly CacheTag[], args: unknown, load: () => Promise<T>): Promise<T> {
  const cache = container().cache;
  if (!cache.enabled) return load();
  const versions = await versionsOnce(orgId);
  if (!versions) return load();
  const stamp = tags.map((t) => versions[t]).join("-");
  const key = `rm:${orgId}:${name}:${stamp}:${createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex").slice(0, 16)}`;
  const hit = await cache.get<T>(key);
  if (hit) return hit.value;
  const fresh = await load();
  await cache.set(key, fresh, READ_MODEL_TTL_SECONDS);
  return fresh;
}
