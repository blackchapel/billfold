import type { Cache, CacheTag, CacheVersions } from "@/domain/ports/cache";
import { CACHE_TAGS } from "@/domain/ports/cache";
import { decode, encode } from "@/lib/cache-codec";
import { logEvent } from "@/lib/log";
import { newVersion, toVersions, versionKey, VERSION_TTL_SECONDS } from "./versions";

type Command = (string | number)[];

const TIMEOUT_MS = 150;
const MAX_VALUE_CHARS = 500_000;
const FAILURES_BEFORE_PAUSE = 3;
const PAUSE_MS = 30_000;

/**
 * The cache on Upstash Redis, spoken to over its HTTPS interface (no open sockets, which suits serverless). Every call is cut off after
 * 150 ms; a few failures in a row switch the cache off for 30 seconds so a sick Redis costs one slow request, not every one. Errors are
 * never thrown: a failure is a miss. The address and token are secrets and are never logged.
 */
export class UpstashCache implements Cache {
  readonly enabled = true;
  private failures = 0;
  private pausedUntil = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly http: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Runs commands as one round trip. `null` means the cache did not answer (down, slow, refused or paused). */
  private async run(commands: Command[]): Promise<unknown[] | null> {
    if (this.clock() < this.pausedUntil) return null;
    try {
      const res = await this.http(`${this.url.replace(/\/$/, "")}/pipeline`, {
        method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
        body: JSON.stringify(commands), signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { result?: unknown; error?: string }[];
      if (!Array.isArray(body) || body.length !== commands.length || body.some((r) => r.error)) throw new Error("bad reply");
      this.failures = 0;
      return body.map((r) => r.result ?? null);
    } catch (e) {
      if (++this.failures >= FAILURES_BEFORE_PAUSE) {
        this.pausedUntil = this.clock() + PAUSE_MS;
        this.failures = 0;
        logEvent("cache_paused", { reason: e instanceof Error ? e.name : "error", seconds: PAUSE_MS / 1000 });
      }
      return null;
    }
  }

  async get<T>(key: string) {
    const out = await this.run([["GET", key]]);
    const text = out?.[0];
    if (typeof text !== "string") return null;
    try { return { value: decode<T>(text) }; } catch { return null; }
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    const text = encode(value);
    if (text.length > MAX_VALUE_CHARS) return; // too big to be worth remembering
    await this.run([["SET", key, text, "EX", ttlSeconds]]);
  }

  async del(...keys: string[]) {
    if (keys.length > 0) await this.run([["DEL", ...keys]]);
  }

  async versions(orgId: string): Promise<CacheVersions | null> {
    const keys = CACHE_TAGS.map((t) => versionKey(orgId, t));
    const first = await this.run([["MGET", ...keys]]);
    if (!first) return null;
    const tokens = (first[0] as (string | null)[]).slice();
    const missing = tokens.flatMap((t, i) => (t === null ? [i] : []));
    if (missing.length === 0) return toVersions(tokens);
    // A tag with no version yet (new organisation, or the key was lost) gets a fresh unique one; NX keeps a concurrent winner's.
    const made = await this.run([
      ...missing.map((i) => ["SET", keys[i] as string, newVersion(), "NX", "EX", VERSION_TTL_SECONDS] as Command),
      ["MGET", ...keys],
    ]);
    return made ? toVersions(made[made.length - 1] as (string | null)[]) : null;
  }

  async bump(orgId: string, tags: readonly CacheTag[]) {
    if (tags.length === 0) return;
    const ok = await this.run(tags.map((t) => ["SET", versionKey(orgId, t), newVersion(), "EX", VERSION_TTL_SECONDS] as Command));
    if (!ok) logEvent("cache_bump_failed", { tags: tags.join(",") }); // old screens may be served until they expire (at most 5 minutes) once Redis is back
  }
}
