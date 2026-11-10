/**
 * The kinds of data an organisation's cached screens are built from. Each has a version per organisation; saving anything of that
 * kind gives it a new version, which makes every cached screen that depended on it unreadable at once (see ADR 0013).
 */
export const CACHE_TAGS = ["members", "connections", "sources", "runConfigs", "recipients", "templates", "bills", "sends", "runs"] as const;
export type CacheTag = (typeof CACHE_TAGS)[number];

export type CacheVersions = Record<CacheTag, string>;

/**
 * A shared, optional, disposable memory in front of the database. Nothing depends on it: when it is absent, slow or down every
 * call quietly behaves as a miss or does nothing, and the database answers. It never holds secrets (tokens are stored sealed).
 */
export interface Cache {
  /** False when no cache is configured: callers skip the cache entirely instead of asking it. */
  readonly enabled: boolean;
  /** `null` for a miss and also whenever the cache cannot answer. The value is wrapped so a stored `null` can be told from a miss. */
  get<T>(key: string): Promise<{ value: T } | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** The current version of every tag for this organisation, or `null` when the cache cannot be trusted right now. */
  versions(orgId: string): Promise<CacheVersions | null>;
  /** Gives these tags a new, never-used version. */
  bump(orgId: string, tags: readonly CacheTag[]): Promise<void>;
}
