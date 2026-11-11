import "server-only";
import { cache as perRequest } from "react";
import type { CacheTag } from "@/domain/ports/cache";
import { readThrough } from "../../application/read-through";
import { container } from "../../composition-root/container";

/** The versions of every tag for an organisation, fetched once per page render (one round trip serves every read model on the page). */
const versionsOnce = perRequest((orgId: string) => container().cache.versions(orgId));

/**
 * Remembers what `load` returns in the shared cache until the data it was built from changes (see `readThrough`). Only for data that
 * is the same for everyone in the organisation: never put per-person or secret data through here.
 */
export async function cachedRead<T>(orgId: string, name: string, tags: readonly CacheTag[], args: unknown, load: () => Promise<T>): Promise<T> {
  const cache = container().cache;
  return readThrough(cache, cache.enabled ? await versionsOnce(orgId) : null, orgId, name, tags, args, load);
}
