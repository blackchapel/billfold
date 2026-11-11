import { describe, expect, it, vi } from "vitest";
import { CACHE_TAGS, type CacheTag } from "@/domain/ports/cache";
import { decode, encode } from "@/lib/cache-codec";
import { readThrough } from "@/server/application/read-through";
import { MemoryCache } from "@/server/infra/cache/memory-cache";
import { NoopCache } from "@/server/infra/cache/noop-cache";
import { UpstashCache } from "@/server/infra/cache/upstash-cache";

describe("cache codec", () => {
  it("round-trips bigint amounts and dates, which plain JSON cannot", () => {
    const original = { amount: 123_456_789_012_345_678n, when: new Date("2026-10-05T10:00:00Z"), nested: [{ n: 0n, d: new Date(0) }], text: "x", none: null };
    expect(decode(encode(original))).toEqual(original);
  });
  it("leaves ordinary objects that merely look similar alone", () => {
    expect(decode(encode({ $b: "not a bigint", other: 1 }))).toEqual({ $b: "not a bigint", other: 1 });
  });
});

describe("readThrough", () => {
  const setup = () => {
    const cache = new MemoryCache();
    const read = async <T>(load: () => Promise<T>, tags: readonly CacheTag[] = ["bills"], args: unknown = null) =>
      readThrough(cache, await cache.versions("org-1"), "org-1", "list", tags, args, load);
    return { cache, read };
  };

  it("loads once and then answers from the cache, keeping a stored null apart from a miss", async () => {
    const { read } = setup();
    const load = vi.fn(async () => null);
    expect(await read(load)).toBeNull();
    expect(await read(load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("keeps different arguments, names and organisations apart", async () => {
    const { cache, read } = setup();
    expect(await read(async () => "a", ["bills"], { page: 1 })).toBe("a");
    expect(await read(async () => "b", ["bills"], { page: 2 })).toBe("b");
    expect(await read(async () => "never", ["bills"], { page: 1 })).toBe("a");
    expect(await readThrough(cache, await cache.versions("org-2"), "org-2", "list", ["bills"], { page: 1 }, async () => "other org")).toBe("other org");
  });
  it("stops serving an entry the moment one of its tags is bumped, and not when an unrelated tag is", async () => {
    const { cache, read } = setup();
    expect(await read(async () => "old", ["bills", "sources"])).toBe("old");
    await cache.bump("org-1", ["recipients"]);
    expect(await read(async () => "NEW", ["bills", "sources"])).toBe("old");
    await cache.bump("org-1", ["sources"]);
    expect(await read(async () => "NEW", ["bills", "sources"])).toBe("NEW");
  });
  it("a reader that was slow cannot overwrite fresher data: it files its answer under the old version", async () => {
    const { cache, read } = setup();
    const versionsBefore = await cache.versions("org-1");
    // The reader asked for versions, then read the database ... and meanwhile someone saved and a newer reader finished first.
    await cache.bump("org-1", ["bills"]);
    expect(await read(async () => "fresh")).toBe("fresh");
    expect(await readThrough(cache, versionsBefore, "org-1", "list", ["bills"], null, async () => "stale")).toBe("stale"); // the slow one finishes last
    expect(await read(async () => "never loaded")).toBe("fresh"); // everyone after the save still sees the fresh answer
  });
  it("never lets a lost counter bring an old entry back: versions are unique tokens, not numbers", async () => {
    const { cache, read } = setup();
    expect(await read(async () => "first")).toBe("first");
    cache.store.delete(`v:org-1:bills`); // as if the version key were evicted
    expect(await read(async () => "second")).toBe("second");
  });
  it("is just the loader when there is no cache, and survives a cache that is down", async () => {
    const noop = new NoopCache();
    expect(await readThrough(noop, await noop.versions(), "o", "n", ["bills"], null, async () => "db")).toBe("db");
    const down = new MemoryCache();
    down.down = true;
    expect(await readThrough(down, await down.versions("o"), "o", "n", ["bills"], null, async () => "db")).toBe("db");
    const cache = new MemoryCache();
    const versions = await cache.versions("o");
    cache.down = true; // goes down between asking for versions and reading
    expect(await readThrough(cache, versions, "o", "n", ["bills"], null, async () => "db")).toBe("db");
  });
  it("expires entries on its own, as the safety net", async () => {
    let now = 1_000_000;
    const cache = new MemoryCache(() => now);
    const run = async (value: string) => readThrough(cache, await cache.versions("o"), "o", "n", ["bills"], null, async () => value);
    expect(await run("a")).toBe("a");
    now += 299_000;
    expect(await run("b")).toBe("a");
    now += 2_000;
    expect(await run("b")).toBe("b");
  });
});

describe("Upstash cache over HTTPS", () => {
  const reply = (results: unknown[]) => Response.json(results.map((result) => ({ result })));
  const make = (handler: (cmds: (string | number)[][]) => Response | Promise<Response>) => {
    const calls: (string | number)[][][] = [];
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const cmds = JSON.parse(String(init?.body)) as (string | number)[][];
      calls.push(cmds);
      expect(String(url)).toBe("https://r.example.upstash.io/pipeline");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
      return handler(cmds);
    });
    let now = 0;
    return { cache: new UpstashCache("https://r.example.upstash.io/", "tok", http as unknown as typeof fetch, () => now), calls, tick: (ms: number) => { now += ms; } };
  };

  it("reads, writes with a lifetime, and deletes", async () => {
    const { cache, calls } = make((cmds) => reply(cmds.map((c) => (c[0] === "GET" ? encode({ a: 1n }) : "OK"))));
    expect(await cache.get<{ a: bigint }>("k")).toEqual({ value: { a: 1n } });
    await cache.set("k", { b: 2 }, 300);
    await cache.del("k1", "k2");
    expect(calls[1]?.[0]).toEqual(["SET", "k", '{"b":2}', "EX", 300]);
    expect(calls[2]?.[0]).toEqual(["DEL", "k1", "k2"]);
  });
  it("treats a missing key, a damaged value and an oversize value as nothing", async () => {
    const miss = make(() => reply([null]));
    expect(await miss.cache.get("k")).toBeNull();
    const bad = make(() => reply(["{not json"]));
    expect(await bad.cache.get("k")).toBeNull();
    const big = make(() => reply(["OK"]));
    await big.cache.set("k", "x".repeat(600_000), 60);
    expect(big.calls).toHaveLength(0);
  });
  it("hands out versions in one round trip, and creates missing ones once with NX", async () => {
    const tokens = CACHE_TAGS.map((t) => `tok-${t}`);
    const have = make(() => reply([tokens]));
    expect(await have.cache.versions("org-1")).toEqual(Object.fromEntries(CACHE_TAGS.map((t) => [t, `tok-${t}`])));
    expect(have.calls).toHaveLength(1);
    expect(have.calls[0]?.[0]?.slice(0, 2)).toEqual(["MGET", "v:org-1:members"]);

    const fresh = make((cmds) => (cmds[0]?.[0] === "MGET" ? reply([CACHE_TAGS.map((t) => (t === "bills" ? null : "x"))]) : reply([...cmds.slice(0, -1).map(() => "OK"), CACHE_TAGS.map(() => "y")])));
    const got = await fresh.cache.versions("org-1");
    expect(got?.bills).toBe("y");
    const make2 = fresh.calls[1] ?? [];
    expect(make2[0]).toEqual(["SET", "v:org-1:bills", expect.any(String), "NX", "EX", expect.any(Number)]);
    expect(make2).toHaveLength(2); // one SET for the one missing tag, then the read
  });
  it("bumps with brand new tokens each time", async () => {
    const { cache, calls } = make((cmds) => reply(cmds.map(() => "OK")));
    await cache.bump("org-1", ["bills", "runs"]);
    await cache.bump("org-1", ["bills"]);
    const first = calls[0]?.[0]?.[2];
    const second = calls[1]?.[0]?.[2];
    expect(calls[0]?.map((c) => c[1])).toEqual(["v:org-1:bills", "v:org-1:runs"]);
    expect(first).not.toBe(second);
  });
  it("never throws: errors, bad replies and timeouts are misses, and a sick Redis is left alone for a while", async () => {
    let healthy = false;
    const { cache, calls, tick } = make(() => { if (!healthy) throw new Error("connect ETIMEDOUT"); return reply([null]); });
    for (let i = 0; i < 3; i++) expect(await cache.get("k")).toBeNull();
    expect(calls).toHaveLength(3);
    expect(await cache.get("k")).toBeNull(); // paused: not even asked
    await cache.set("k", 1, 5); await cache.bump("o", ["bills"]); expect(await cache.versions("o")).toBeNull();
    expect(calls).toHaveLength(3);
    healthy = true;
    tick(31_000);
    await cache.get("k");
    expect(calls).toHaveLength(4); // asked again after the pause
  });
  it("treats an HTTP error status or an error reply as a failure", async () => {
    const denied = make(() => new Response("no", { status: 401 }));
    expect(await denied.cache.get("k")).toBeNull();
    const broken = make(() => Response.json([{ error: "ERR wrong" }]));
    expect(await broken.cache.get("k")).toBeNull();
  });
});
