import type { Cache } from "@/domain/ports/cache";
import { logEvent } from "@/lib/log";

/** What a write must do to the cache once it has finished (and therefore committed). */
export interface EffectContext {
  args: unknown[];
  result: unknown;
  cache: Cache;
  /** Everyone who belongs to an organisation, for effects that change what all of them see. */
  memberIds(orgId: string): Promise<string[]>;
}
export type Effect = (ctx: EffectContext) => Promise<void>;

export interface CachedRead {
  key(args: unknown[]): string;
  ttlSeconds: number;
}

/**
 * Says, for every method of one repository, what it is: plain (a read, or a write that nothing cached depends on, left alone), a read
 * worth remembering, or a write with the effect it has on the cache. A test lists the real classes' methods and fails when one is in none of the groups, so a new method cannot be added
 * without deciding what it does to the cache.
 */
export interface Spec<R> {
  plain: readonly (keyof R)[];
  cachedReads?: Partial<Record<keyof R, CachedRead>>;
  writes: Partial<Record<keyof R, Effect>>;
}

/**
 * Wraps a repository so that every write bumps the right versions or deletes the right keys after it succeeds, in one place, rather
 * than hoping each use case remembers to. A failing cache never fails the write: the data is saved, the old screens expire on their own.
 */
export function invalidating<R extends object>(inner: R, spec: Spec<R>, cache: Cache, memberIds: (orgId: string) => Promise<string[]>): R {
  return new Proxy(inner, {
    get(target, prop) {
      const member = Reflect.get(target, prop, target) as unknown;
      if (typeof member !== "function" || typeof prop !== "string") return member;
      const call = member as (...a: unknown[]) => Promise<unknown>;
      const effect = spec.writes[prop as keyof R];
      if (effect) {
        return async (...args: unknown[]) => {
          const result = await call.apply(target, args);
          try { await effect({ args, result, cache, memberIds }); }
          catch (e) { logEvent("cache_effect_failed", { method: prop, error: e instanceof Error ? e.name : "error" }); }
          return result;
        };
      }
      const cached = spec.cachedReads?.[prop as keyof R];
      if (cached && cache.enabled) {
        return async (...args: unknown[]) => {
          const key = cached.key(args);
          const hit = await cache.get<unknown>(key);
          if (hit) return hit.value;
          const fresh = await call.apply(target, args);
          await cache.set(key, fresh, cached.ttlSeconds);
          return fresh;
        };
      }
      return call.bind(target);
    },
  });
}
