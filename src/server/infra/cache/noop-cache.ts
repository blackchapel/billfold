import type { Cache } from "@/domain/ports/cache";

/** Used when no Redis is configured: every read is a miss and nothing is remembered, so the app behaves exactly as it did without a cache. */
export class NoopCache implements Cache {
  readonly enabled = false;
  async get() { return null; }
  async set() {}
  async del() {}
  async versions() { return null; }
  async bump() {}
}
