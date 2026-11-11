import type { Cache, CacheTag, CacheVersions } from "@/domain/ports/cache";
import { CACHE_TAGS } from "@/domain/ports/cache";
import { decode, encode } from "@/lib/cache-codec";
import { newVersion, versionKey, VERSION_TTL_SECONDS } from "./versions";

/** The same behaviour as the Redis cache, inside this process: for tests and test mode. Entries expire like the real thing. */
export class MemoryCache implements Cache {
  readonly enabled = true;
  readonly store = new Map<string, { text: string; expires: number }>();
  /** Set to make every call act as if the cache were unreachable. */
  down = false;

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string) {
    if (this.down) return null;
    const hit = this.store.get(key);
    if (!hit || hit.expires <= this.now()) { this.store.delete(key); return null; }
    return { value: decode<T>(hit.text) };
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    if (this.down) return;
    this.store.set(key, { text: encode(value), expires: this.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]) {
    if (this.down) return;
    for (const k of keys) this.store.delete(k);
  }

  async versions(orgId: string): Promise<CacheVersions | null> {
    if (this.down) return null;
    const out = {} as CacheVersions;
    for (const tag of CACHE_TAGS) {
      const key = versionKey(orgId, tag);
      let hit = this.store.get(key);
      if (!hit || hit.expires <= this.now()) { hit = { text: encode(newVersion()), expires: this.now() + VERSION_TTL_SECONDS * 1000 }; this.store.set(key, hit); }
      out[tag] = decode<string>(hit.text);
    }
    return out;
  }

  async bump(orgId: string, tags: readonly CacheTag[]) {
    if (this.down) return;
    for (const tag of tags) this.store.set(versionKey(orgId, tag), { text: encode(newVersion()), expires: this.now() + VERSION_TTL_SECONDS * 1000 });
  }
}
